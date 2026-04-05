import { NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { getChatById, saveChat, saveMessages } from '@/lib/db/queries';
import { generateUUID } from '@/lib/utils';
import OpenAI from 'openai';
import postgres from 'postgres';

export const maxDuration = 60;

// NVIDIA API (OpenAI-compatible) for embeddings + LLM
const nvidia = new OpenAI({
  baseURL: 'https://integrate.api.nvidia.com/v1',
  apiKey: process.env.NVIDIA_API_KEY || '',
});

// Direct connection to NeonDB for vector search (separate from Drizzle)
const ragDb = postgres(process.env.POSTGRES_URL ?? '', { ssl: 'require' });

// ─── RAG Helper Functions ───

async function embedText(text: string): Promise<number[]> {
  const resp = await nvidia.embeddings.create({
    input: [text],
    model: 'nvidia/nv-embedqa-e5-v5',
    encoding_format: 'float',
    // @ts-ignore - NVIDIA-specific parameter
    extra_body: { input_type: 'query', truncate: 'NONE' },
  });
  return resp.data[0].embedding;
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

    // Ensure chat exists
    const chatExists = await getChatById({ id });
    if (!chatExists) {
      await saveChat({ id, userId: session.user.id, title: userQuery.substring(0, 100), visibility: 'private' });
    }

    // ─── RAG: Retrieve, Build Context, Call LLM ───

    const { top: topRows, all: allRows } = await retrieveChunks(userQuery, 5, 15);

    let answer = '';
    let sources: any[] = [];
    let related: any[] = [];

    if (!topRows.length) {
      // No chunks found — answer from general knowledge
      const completion = await nvidia.chat.completions.create({
        model: 'moonshotai/kimi-k2.5',
        messages: [{ role: 'user', content: `Та бол Монгол Улсын барилгын норм, стандартын мэргэжилтэн. Хэрэглэгчийн асуултад Монгол хэлээр дэлгэрэнгүй хариулна уу.\n\nАсуулт: ${userQuery}` }],
        temperature: 0.3,
        max_tokens: 16384,
      });
      answer = completion.choices[0].message.content || '';
    } else {
      // Deduplicate and build context
      const deduped = deduplicateSources(topRows);
      const topSourceNames = new Set(deduped.map(d => d.metadata?.source));

      // Build source reference map and context
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

        const location = [
          page ? `хуудас ${page}` : '',
          section ? `§${section}` : '',
        ].filter(Boolean).join(', ');

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

      const refsText = sourceRefs.join('\n');
      const context = contextBlocks.join('\n\n---\n\n');

      const prompt = `Та бол "Барилгын Нэгдсэн Мэдээллийн Тов" (MBI) - Монгол Улсын барилгын норм, стандартын AI туслах юм.

ЧУХАЛ ДҮРЭМ:
1. Доорх эх сурвалжууд дээр ҮР ДҮНТЭЙ үндэслэн ЗААВАЛ хариулна уу. "Олдсонгүй", "тайлбар байхгүй" гэж ХЭЗЭЭ Ч БҮҮҮ хэлээрэй.
2. Эх сурвалжуудад шууд хариулт байхгүй ч гэсэн тэдгээрт байгаа мэдээллийг нэгтгэн, дүгнэн, тайлбарлан хариулна уу.
3. Хариулт дотроо эх сурвалжийг [1], [2], [3] гэх мэтээр заавал дурдана уу. Жишээ: "Барилгын геодезийн ажлыг ... тодорхойлсон байдаг [1]."
4. Зөвхөн Монгол хэлээр хариулна уу.
5. Хариултаа тодорхой, бүтэцтэй байдлаар бичнэ үү.
6. Хариултын ТӨГСГӨЛД эх сурвалжуудыг БҮҮҮ ЖАГСААЖ бичээрэй. Зөвхөн [1], [2] гэх мэт тэмдэглэгээг хариулт дотор ашиглана уу.

ЭХ СУРВАЛЖУУДЫН ЛАВЛАХ:
${refsText}

ЭХ СУРВАЛЖУУД:
${context}

АСУУЛТ: ${userQuery}
`;

      const completion = await nvidia.chat.completions.create({
        model: 'moonshotai/kimi-k2.5',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        top_p: 0.9,
        max_tokens: 16384,
      });
      answer = completion.choices[0].message.content || '';
    }

    // ─── Save messages to DB ───

    const userMessageId = message?.id || generateUUID();
    const assistantMessageId = generateUUID();

    await saveMessages({
      messages: [
        { id: userMessageId, chatId: id, role: 'user', parts: [{ type: 'text', text: userQuery }], attachments: [], createdAt: new Date() },
        { id: assistantMessageId, chatId: id, role: 'assistant', parts: [{ type: 'text', text: answer }], attachments: [], createdAt: new Date() },
      ]
    });

    // ─── Build markdown content with inline source links ───

    let fullContent = answer;

    // Build source map for [n] replacement
    const sourceMap: Record<string, { label: string; link: string }> = {};
    for (let i = 0; i < sources.length; i++) {
      const s = sources[i];
      const location = [s.page ? `хуудас ${s.page}` : '', s.section ? `§${s.section}` : ''].filter(Boolean).join(', ');
      const label = s.title + (location ? ` (${location})` : '');
      sourceMap[`[${i + 1}]`] = { label, link: s.link || '' };
    }

    // Replace [1], [2] with clickable links
    for (const [ref, info] of Object.entries(sourceMap)) {
      const escaped = ref.replace('[', '\\[').replace(']', '\\]');
      const replacement = info.link ? `[${ref}](${info.link})` : ref;
      fullContent = fullContent.replace(new RegExp(escaped, 'g'), replacement);
    }

    // Append source reference list
    if (sources.length > 0) {
      fullContent += '\n\n---\n\n**Эх сурвалжууд:**\n\n';
      for (let i = 0; i < sources.length; i++) {
        const s = sources[i];
        const location = [s.page ? `хуудас ${s.page}` : '', s.section ? `§${s.section}` : ''].filter(Boolean).join(', ');
        const label = s.title + (location ? ` — ${location}` : '');
        if (s.link) {
          fullContent += `**[${i + 1}]** [${label}](${s.link}) — ${s.relevance}%\n\n`;
        } else {
          fullContent += `**[${i + 1}]** ${label} — ${s.relevance}%\n\n`;
        }
      }
    }

    // Related docs
    if (related.length > 0) {
      fullContent += '**Хамааралтай баримт бичгүүд:**\n\n';
      for (const r of related) {
        if (r.link) {
          fullContent += `[${r.title}](${r.link}) — ${r.relevance}%\n\n`;
        } else {
          fullContent += `${r.title} — ${r.relevance}%\n\n`;
        }
      }
    }

    // ─── Stream response (AI SDK v6 UI Message Stream) ───

    const textPartId = generateUUID();
    const encoder = new TextEncoder();
    const words = fullContent.match(/\S+|\s+/g) || [fullContent];

    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: object) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        };

        send({ type: 'start', messageId: assistantMessageId });
        send({ type: 'start-step' });
        send({ type: 'text-start', id: textPartId });

        for (const word of words) {
          send({ type: 'text-delta', id: textPartId, delta: word });
          await new Promise((r) => setTimeout(r, 15));
        }

        send({ type: 'text-end', id: textPartId });
        send({ type: 'finish-step' });
        send({ type: 'finish', finishReason: 'stop' });
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
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
