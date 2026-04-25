import { NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { getChatById, saveChat, saveMessages } from '@/lib/db/queries';
import { generateUUID } from '@/lib/utils';
import OpenAI from 'openai';
import postgres from 'postgres';

export const maxDuration = 60;

// NVIDIA (OpenAI-compatible) for chat. Embeddings use direct fetch in embedText.
const nvidia = new OpenAI({
  baseURL: 'https://integrate.api.nvidia.com/v1',
  apiKey: process.env.NVIDIA_API_KEY || '',
});

// Direct connection to NeonDB for vector search (separate from Drizzle).
// max:1 prevents Neon connection exhaustion under concurrent serverless invocations.
const ragDb = postgres(process.env.POSTGRES_URL ?? '', {
  ssl: 'require',
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
});

// Per-instance embedding cache. Suggested questions and repeats skip the NVIDIA call.
const embedCache = new Map<string, number[]>();
const EMBED_CACHE_MAX = 500;

// ─── RAG Helper Functions ───

async function embedText(text: string): Promise<number[]> {
  const cached = embedCache.get(text);
  if (cached) return cached;

  // Direct fetch: the OpenAI JS SDK sends `extra_body` literally, which NVIDIA rejects.
  // input_type/truncate must be top-level fields.
  const resp = await fetch('https://integrate.api.nvidia.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.NVIDIA_API_KEY ?? ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: [text],
      model: 'nvidia/nv-embedqa-e5-v5',
      encoding_format: 'float',
      input_type: 'query',
      truncate: 'NONE',
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) {
    throw new Error(`embed ${resp.status}: ${await resp.text()}`);
  }
  const data = (await resp.json()) as { data: { embedding: number[] }[] };
  const embedding = data.data[0].embedding;

  if (embedCache.size >= EMBED_CACHE_MAX) {
    const firstKey = embedCache.keys().next().value;
    if (firstKey !== undefined) embedCache.delete(firstKey);
  }
  embedCache.set(text, embedding);
  return embedding;
}

function distanceToRelevance(distance: number): number {
  const similarity = Math.max(0, 1 - distance);
  return Math.max(5, Math.min(100, Math.round(similarity * 120 - 10)));
}

function buildDeepLink(meta: any): string {
  const page = meta?.page_number || '';
  if (meta?.source_url) {
    return page ? `${meta.source_url}#page=${page}` : meta.source_url;
  }
  return '';
}

interface ChunkRow {
  text: string;
  metadata: any;
  distance: number;
}

async function retrieveChunks(query: string, topK = 5, relatedK = 15): Promise<{ top: ChunkRow[]; all: ChunkRow[] }> {
  try {
    const qVec = await embedText(query);
    const vecStr = `[${qVec.join(',')}]`;

    const rows = await ragDb`
      SELECT text, metadata, embedding <=> ${vecStr}::vector AS distance
      FROM chunks
      ORDER BY embedding <=> ${vecStr}::vector
      LIMIT ${relatedK}
    `;

    const chunks: ChunkRow[] = rows.map((r: any) => ({
      text: r.text,
      metadata: r.metadata,
      distance: parseFloat(r.distance),
    }));

    return { top: chunks.slice(0, topK), all: chunks };
  } catch (e) {
    console.error('Retrieval error:', e);
    return { top: [], all: [] };
  }
}

function deduplicateSources(rows: ChunkRow[], maxItems = 5) {
  const seen: Record<string, ChunkRow> = {};
  for (const row of rows) {
    const key = `${row.metadata?.source}:${row.metadata?.page_number}`;
    if (!seen[key] || row.distance < seen[key].distance) {
      seen[key] = row;
    }
  }
  return Object.values(seen).sort((a, b) => a.distance - b.distance).slice(0, maxItems);
}

function buildRelatedDocs(allRows: ChunkRow[], topSourceNames: Set<string>) {
  const related: Record<string, any> = {};
  for (const row of allRows) {
    const name = row.metadata?.source || '';
    if (topSourceNames.has(name)) continue;
    if (!related[name] || row.distance < related[name].distance) {
      related[name] = {
        title: name,
        category: row.metadata?.category || '',
        relevance: distanceToRelevance(row.distance),
        link: buildDeepLink(row.metadata),
        distance: row.distance,
      };
    }
  }
  return Object.values(related)
    .sort((a: any, b: any) => a.distance - b.distance)
    .filter((r: any) => r.relevance > 20)
    .slice(0, 5);
}

// ─── Main Chat Endpoint ───

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { getUser } = await import('@/lib/db/queries');
    const existingUsers = await getUser(session.user.email!);
    if (existingUsers.length === 0) {
      return NextResponse.json({
        error: 'Session Expired',
        details: 'Please logout and login again.',
      }, { status: 401 });
    }

    const json = await req.json();
    const { id, message, messages, selectedChatModel } = json;

    let userQuery = '';
    if (message?.role === 'user') {
      const textPart = message.parts?.find((p: any) => p.type === 'text');
      if (textPart) userQuery = textPart.text;
    } else if (messages?.length > 0) {
      const last = messages[messages.length - 1];
      if (last.role === 'user') {
        const textPart = last.parts?.find((p: any) => p.type === 'text');
        if (textPart) userQuery = textPart.text;
        else if (typeof last.content === 'string') userQuery = last.content;
      }
    }

    if (!userQuery) {
      return NextResponse.json({ error: 'Invalid message payload' }, { status: 400 });
    }

    // ─── RAG: ensure chat row + retrieve chunks in parallel ───
    const t0 = Date.now();
    const [chatExists, retrieval] = await Promise.all([
      getChatById({ id }),
      retrieveChunks(userQuery, 10, 20),
    ]);
    if (!chatExists) {
      await saveChat({ id, userId: session.user.id, title: userQuery.substring(0, 100), visibility: 'private' });
    }
    const { top: topRows, all: allRows } = retrieval;
    console.log(`[t] retrieve+chat: ${Date.now() - t0}ms`);

    // ─── Build prompt + source metadata ───
    const sources: any[] = [];
    let related: any[] = [];
    let prompt: string;

    if (!topRows.length) {
      prompt = `Та бол Монгол Улсын барилгын норм, стандартын мэргэжилтэн. Хэрэглэгчийн асуултад Монгол хэлээр дэлгэрэнгүй хариулна уу.\n\nАсуулт: ${userQuery}`;
    } else {
      const deduped = deduplicateSources(topRows, 8);
      const topSourceNames = new Set(deduped.map(d => d.metadata?.source));
      const contextBlocks: string[] = [];
      const sourceRefs: string[] = [];

      for (let i = 0; i < deduped.length; i++) {
        const { text, metadata: meta, distance } = deduped[i];
        const name = meta?.source || '';
        const page = meta?.page_number || '';
        const section = meta?.section || '';

        let loc = name;
        if (page) loc += `, хуудас ${page}`;
        if (section) loc += `, §${section}`;

        sourceRefs.push(`[${i + 1}] = ${loc}`);
        contextBlocks.push(`[${i + 1}]\n${text}`);

        sources.push({
          title: name,
          section,
          page,
          category: meta?.category || '',
          snippet: text.substring(0, 200) + (text.length > 200 ? '...' : ''),
          relevance: distanceToRelevance(distance),
          link: buildDeepLink(meta),
        });
      }

      related = buildRelatedDocs(allRows, topSourceNames);

      prompt = `Та бол "Барилгын Нэгдсэн Мэдээллийн Тов" (MBI) - Монгол Улсын барилгын норм, стандартын AI туслах юм.

ЧУХАЛ ДҮРЭМ:
1. Хариулт ЗААВАЛ хэрэгтэй мэдээллийг өөртөө шууд агуулсан байх ёстой. "Эх сурвалж [1]-ээс үзнэ үү", "дэлгэрэнгүй [2]-т байна" гэх мэтээр зөвхөн заагаад болохгүй — мэдээллийг өөрөө бичиж өг.
2. Жагсаалтын асуултанд (жишээ нь: "юу юу", "ямар ямар", "жагсаалт", "төрлүүд") ЗААВАЛ цэгтэй жагсаалт (markdown bullet list) хэлбэрээр бүх зүйлийг тоочиж бич. Жишээ:
   - **Зүйл 1**: тайлбар [1]
   - **Зүйл 2**: тайлбар [2]
   - **Зүйл 3**: тайлбар [3]
3. Эх сурвалжуудад шууд хариулт байхгүй ч гэсэн тэдгээрт байгаа мэдээллийг нэгтгэн, дүгнэн, тайлбарлан хариулна уу. "Олдсонгүй", "тайлбар байхгүй" гэж ХЭЗЭЭ Ч БҮҮ хэлээрэй.
4. Эх сурвалжийг [1], [2], [3] гэх мэт тэмдэглэгээгээр заавал дурдана уу.
5. Зөвхөн Монгол хэлээр хариулна уу.
6. Хариултын ТӨГСГӨЛД эх сурвалжуудын жагсаалтыг БҮҮ давтан бичээрэй (систем автоматаар нэмнэ).

ЭХ СУРВАЛЖУУДЫН ЛАВЛАХ:
${sourceRefs.join('\n')}

ЭХ СУРВАЛЖУУД:
${contextBlocks.join('\n\n---\n\n')}

АСУУЛТ: ${userQuery}
`;
    }

    const userMessageId = message?.id || generateUUID();
    const assistantMessageId = generateUUID();
    const textPartId = generateUUID();
    const encoder = new TextEncoder();

    // Save user message immediately so we don't lose it on LLM failure.
    await saveMessages({
      messages: [
        { id: userMessageId, chatId: id, role: 'user', parts: [{ type: 'text', text: userQuery }], attachments: [], createdAt: new Date() },
      ]
    });

    // ─── Stream LLM response directly into SSE (AI SDK v6 UI Message Stream) ───
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: object) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        };

        send({ type: 'start', messageId: assistantMessageId });
        send({ type: 'start-step' });
        send({ type: 'text-start', id: textPartId });

        let answer = '';
        const tLlm = Date.now();
        try {
          const completion = await nvidia.chat.completions.create({
            model: 'meta/llama-3.3-70b-instruct',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            top_p: 0.9,
            max_tokens: 1024,
            stream: true,
          }, { signal: AbortSignal.timeout(60000) });

          // Stop streaming when the model starts writing its own source list
          // (the system appends a canonical one after). Lookahead buffer of 80 chars
          // catches patterns split across deltas.
          // Catches "Эх сурвалж:", "ЭХ СУРВАЛЖУУД:", "**Эх сурвалжууд:**", "Sources:" etc.
          // \p{L}* matches Mongolian plural suffixes like "ууд". `u` flag enables proper Cyrillic case folding.
          const STOP_PATTERN = /\n\s*[*#]{0,3}\s*(?:Эх\s+сурвалж|Сурвалж|Source)\p{L}*\s*:/iu;
          const LOOKAHEAD = 80;
          let pendingBuffer = '';
          let stopped = false;
          let firstToken = true;

          for await (const chunk of completion as any) {
            const delta = chunk.choices?.[0]?.delta?.content || '';
            if (!delta) continue;
            if (firstToken) {
              console.log(`[t] llm first token: ${Date.now() - tLlm}ms`);
              firstToken = false;
            }
            if (stopped) continue; // drain remaining LLM stream silently

            pendingBuffer += delta;

            const combined = answer + pendingBuffer;
            const match = combined.match(STOP_PATTERN);
            if (match && match.index !== undefined) {
              const cleanLength = match.index;
              const additional = combined.substring(answer.length, cleanLength);
              if (additional.length > 0) {
                answer += additional;
                send({ type: 'text-delta', id: textPartId, delta: additional });
              }
              pendingBuffer = '';
              stopped = true;
              continue;
            }

            // Flush everything except the lookahead window
            if (pendingBuffer.length > LOOKAHEAD) {
              const flushAmount = pendingBuffer.length - LOOKAHEAD;
              const toFlush = pendingBuffer.substring(0, flushAmount);
              answer += toFlush;
              send({ type: 'text-delta', id: textPartId, delta: toFlush });
              pendingBuffer = pendingBuffer.substring(flushAmount);
            }
          }

          // Flush any remaining buffered text (only if model never tried its own source list)
          if (!stopped && pendingBuffer.length > 0) {
            answer += pendingBuffer;
            send({ type: 'text-delta', id: textPartId, delta: pendingBuffer });
          }
          console.log(`[t] llm total: ${Date.now() - tLlm}ms`);
        } catch (e) {
          console.error('LLM stream error:', e);
          const fallback = answer
            ? '\n\n[Хариулт тасарлаа. Дахин оролдоно уу.]'
            : 'Уучлаарай, систем одоогоор ачаалал ихтэй байна. Хэдэн хормын дараа дахин оролдоно уу.';
          answer += fallback;
          send({ type: 'text-delta', id: textPartId, delta: fallback });
        }

        // Append sources + related docs as additional deltas (not in LLM stream).
        if (sources.length > 0) {
          let extra = '\n\n---\n\n**Эх сурвалжууд:**\n\n';
          for (let i = 0; i < sources.length; i++) {
            const s = sources[i];
            const location = [s.page ? `хуудас ${s.page}` : '', s.section ? `§${s.section}` : ''].filter(Boolean).join(', ');
            const label = s.title + (location ? ` — ${location}` : '');
            extra += s.link
              ? `**[${i + 1}]** [${label}](${s.link}) — ${s.relevance}%\n\n`
              : `**[${i + 1}]** ${label} — ${s.relevance}%\n\n`;
          }
          if (related.length > 0) {
            extra += '**Хамааралтай баримт бичгүүд:**\n\n';
            for (const r of related) {
              extra += r.link
                ? `[${r.title}](${r.link}) — ${r.relevance}%\n\n`
                : `${r.title} — ${r.relevance}%\n\n`;
            }
          }
          answer += extra;
          send({ type: 'text-delta', id: textPartId, delta: extra });
        }

        send({ type: 'text-end', id: textPartId });
        send({ type: 'finish-step' });
        send({ type: 'finish', finishReason: 'stop' });
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();

        // Persist assistant message after the stream closes (don't block the user).
        saveMessages({
          messages: [
            { id: assistantMessageId, chatId: id, role: 'assistant', parts: [{ type: 'text', text: answer }], attachments: [], createdAt: new Date() },
          ]
        }).catch((e) => console.error('Failed to save assistant message:', e));
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'x-vercel-ai-ui-message-stream': 'v1',
        'x-accel-buffering': 'no',
      }
    });

  } catch (error) {
    console.error('Chat API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function DELETE() {
  return NextResponse.json({ success: true });
}
