import { ArrowLeftIcon, HardHatIcon, BookOpenIcon, DatabaseIcon, MessageSquareIcon, UsersIcon } from "lucide-react";
import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="flex min-h-dvh w-full bg-background">
      <div className="mx-auto w-full max-w-2xl px-6 py-8">
        <Link
          className="flex w-fit items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground mb-8"
          href="/"
        >
          <ArrowLeftIcon className="size-3.5" />
          Буцах
        </Link>

        <div className="flex items-center gap-3 mb-10">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
            <HardHatIcon size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              MBI - Барилгын AI туслах
            </h1>
            <p className="text-sm text-muted-foreground">
              Монгол Улсын барилгын норм, стандартын мэдээллийн систем
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-10">
          <section>
            <div className="flex items-center gap-2 mb-3">
              <BookOpenIcon size={18} className="text-primary" />
              <h2 className="text-lg font-medium">Тухай</h2>
            </div>
            <p className="text-[14px] leading-relaxed text-muted-foreground">
              MBI нь Монгол Улсын барилгын норм, дүрэм, стандартын талаар асуулт
              асууж, хариулт авах боломжтой AI туслах юм. Барилгын салбарын
              мэргэжилтнүүд, инженерүүд, оюутнууд болон бусад сонирхогчдод
              зориулагдсан.
            </p>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <DatabaseIcon size={18} className="text-primary" />
              <h2 className="text-lg font-medium">Ямар мэдээлэл агуулдаг вэ?</h2>
            </div>
            <p className="text-[14px] text-muted-foreground mb-3">
              mcis.gov.mn болон tz.mnca.mn сайтуудаас авсан нийт 42 баримт бичиг оруулсан:
            </p>
            <ul className="flex flex-col gap-2.5 text-[14px] text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60" />
                <span><strong>Хууль, эрх зүй</strong> — Барилгын тухай хууль, Хот байгуулалтын тухай хууль, Зөвшөөрлийн тухай хууль</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60" />
                <span><strong>Эрх зүйн баримт бичиг</strong> — Барилгын салбарын хууль тогтоомжийн эмхэтгэл (2018-2023)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60" />
                <span><strong>Сайдын тушаал, дүрэм</strong> — Барилгын ангилал, мэргэжилтэн, зураг төсөл зэрэг тушаалууд</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60" />
                <span><strong>Архитектур, барилга</strong> — Олон нийтийн барилга, орон сууц, газар хөдлөлтийн тэсвэрлэлт</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60" />
                <span><strong>Хот байгуулалт</strong> — Хот суурин газрын нутаг дэвсгэрийн хөгжлийн зарчим (1-6 боть)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60" />
                <span><strong>Барилгын аюулгүй байдал, эдийн засаг</strong> — Халаасны ном I-IV (аюулгүй ажиллагаа, механикжуулалт, төсөв, ус хангамж)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60" />
                <span><strong>Мэргэжлийн зөвлөлийн материал</strong> — Өндөр барилга, бүтээц, эдийн засаг, дэд бүтэц, материал зэрэг зөвлөлүүдийн тайлан (2022-2025)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60" />
                <span><strong>Геодези, инженер геологи</strong> — Барилгын геодезийн ажил, топо зураглал, инженер геологийн ажил</span>
              </li>
            </ul>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <MessageSquareIcon size={18} className="text-primary" />
              <h2 className="text-lg font-medium">Хэрхэн ашиглах вэ?</h2>
            </div>
            <ol className="flex flex-col gap-2.5 text-[14px] text-muted-foreground list-decimal list-inside">
              <li>Бүртгүүлэх эсвэл нэвтрэх</li>
              <li>Чат хэсэгт барилгын нормын талаар асуултаа бичих</li>
              <li>AI таны асуултад холбогдох норм, стандартаас мэдээлэл хайж хариулна</li>
              <li>Хариулт дотор эх сурвалжийн лавлагааг [1], [2] гэх мэтээр харах боломжтой</li>
              <li>Хариултыг хуулах, үнэлгээ өгөх боломжтой</li>
            </ol>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <UsersIcon size={18} className="text-primary" />
              <h2 className="text-lg font-medium">Хамтран ажиллах</h2>
            </div>
            <p className="text-[14px] leading-relaxed text-muted-foreground">
              Энэхүү систем нь хөгжүүлэлтийн шатандаа байгаа бөгөөд бид барилгын
              салбарын мэргэжилтнүүдтэй хамтран ажиллахад нээлттэй байна. Санал,
              хүсэлт, алдааны мэдэгдлээ бидэнд илгээнэ үү.
            </p>
          </section>

          <div className="rounded-xl border border-border/50 bg-card/30 p-4 text-center text-[13px] text-muted-foreground">
            <p>
              Энэ систем нь AI дээр суурилсан тул хариултууд нь заримдаа алдаатай
              байж болно. Чухал шийдвэр гаргахдаа эх сурвалжийг шалгаж
              баталгаажуулна уу.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
