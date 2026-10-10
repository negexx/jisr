export type QuestionItem = {
  key: string;
  title: string;
  body: string;
};

type QuestionsProps = {
  kicker: string;
  title: string;
  items: readonly QuestionItem[];
};

export function Questions({ kicker, title, items }: QuestionsProps) {
  return (
    <section
      aria-labelledby="questions"
      className="-mx-4 bg-secondary py-20 text-start md:-mx-6 md:py-24"
    >
      <div className="mx-auto w-full max-w-5xl px-4 md:px-6">
        <span className="text-sm font-semibold tracking-[0.06em] text-primary uppercase">
          {kicker}
        </span>
        <h2
          id="questions"
          className="mt-3 text-2xl font-light tracking-tight text-balance md:text-3xl"
        >
          {title}
        </h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item, index) => (
            <article
              key={item.key}
              className="rounded-2xl border border-border bg-card p-6 shadow-sm transition duration-200 ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-1 hover:shadow-md motion-reduce:transition-none"
            >
              <span
                aria-hidden="true"
                className="grid size-8 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground"
              >
                {index + 1}
              </span>
              <h3 className="mt-4 text-lg font-semibold tracking-tight text-balance">
                {item.title}
              </h3>
              <p className="mt-2 text-base text-muted-foreground">{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
