# Throxy Technical Challenge: Persona Ranker

## About Throxy

We're an AI-powered sales company booking meetings in traditional industries. We're a data company at our core; we find the ideal accounts and leads to book you meetings.

We're growing fast and hiring full stack developers for our internal platform.

---

## The Challenge

Build our **persona ranking system**: given a list of people at target companies, qualify and rank them against an ideal customer persona and surface the best relevant contacts for each company.

A goal use case of this system would be to create email campaigns where we only contact the most fit N **relevant** leads per company.

- If a lead is not relevant, we won’t want to contact them! For a company, we might only have the contact of an HR worker for example, but that doesn’t mean we should contact them to sell them a sales platform. Think about integrating this into your ranking process.

You'll receive:

- A CSV of leads (name, title, company, Linkedin, etc.)
- A persona spec defining who we want to contact and who we don't.

**It's up to you to decide the best way to qualify and rank leads using AI.** We care about your approach, decisions taken (and why) and the ranking strategy you follow, not any specific implementation.

---

## Tech Stack

- React / Next.js with TypeScript
- Postgres (we recommend Supabase)
- Vercel for deployment
- AI provider of your choice (OpenAI, Anthropic, etc.)

---

## MVP Requirements

Your submission must:

1. **Load leads into the database**
   1. No frontend needed for ingestion
2. **Execute the AI ranking process** against the persona spec **from the frontend**
   1. Make sure this is easily reusable! Think about how this would work if we were to scale the application to allow for new CSVs to be ingested from the frontend and implement it accordingly.
3. **Display results in a table** showing people and their rankings
4. **Be deployed** to a live Vercel URL
5. **Include a README** documenting:
   - How to run locally
   - Very brief architecture overview
   - Key decisions taken
   - Tradeoffs you made due to lack of time / size of the project

**Optional:** 90-second video walkthrough of your solution

---

## Bonus Challenge

Pick what interests you. These aren't required, but they tell us a lot about how you think. They are ambiguous by choice; you have complete freedom to implement them. You may only implement one of them; we want to see your thought process behind the planning, execution and polishing of the feature. Quality over quantity. Focus on producing high-quality code and thought-out, effective solutions where we can see your critical thinking skills shining.

| Difficulty  | Challenge                                           |
| ----------- | --------------------------------------------------- |
| 🟢 Easy     | Track cost per AI call + show statistics.           |
| 🟢 Easy     | Make the table sortable by rank.                    |
| 🟢 Easy     | Export top N people per company to CSV.             |
| 🟡 Medium   | Add and rank new leads through CSV uploads.         |
| 🟡 Medium   | Real-time ranking progress and table updates.       |
| 🔴 Hard     | Automatic prompt optimization.                      |
| ❓Up to you | Create your own challenge! Show us where you shine. |

### About the Hard Bonus

We'll provide a second CSV with 50 pre-ranked leads. Your task: use this evaluation set to automatically optimize your ranking prompt through AI agents.

Reference: [Automatic Prompt Optimization](https://cameronrwolfe.substack.com/p/automatic-prompt-optimization)

This is genuinely difficult and will take several hours. We don't expect most candidates to attempt it. But if you nail this, you're exactly who we're looking for: someone who is passionate about coding, loves building AI systems and goes deep on hard problems.

---

## Assets Provided

| File                 | Description                                          |
| -------------------- | ---------------------------------------------------- |
| `leads.csv`          | ~200 leads to rank                                   |
| `persona_spec.md`    | Ideal persona definition + disqualification criteria |
| `evaluation_set.csv` | 50 pre-ranked leads (for hard bonus only)            |

https://docs.google.com/spreadsheets/d/1Yw15aB7eZhEqni86AV1KwO26czyrH60CTxbhHbCt6Zg/edit?gid=2090812281#gid=2090812281

https://docs.google.com/spreadsheets/d/1GB7Mwf8zdBRIad2ZwbeRpNNtRITpDUS1XhHfall0Hh0/edit?usp=sharing

[persona_spec.md](https://www.notion.so/persona_spec-md-2ce9d2ef70de80869218c5c072080ede?pvs=21)

---

## Time Expectation

- **MVP:** ~2-3 hours
- **Bonus challenge:** 1+ hours, depending on the task.

We're not timing you. Take the time you need to show your best work but don't over-engineer. Lean code that works beats elaborate code that doesn't.

---

## What We're Looking For

1. **Clean, maintainable code:** Structure matters more than cleverness. Make reusable components, follow React best practices and scope files properly within semantic domains.
2. **Thoughtful AI integration:** Prompt design, cost awareness, giving the AI only the relevant information.
3. **It works:** End-to-end functionality beats partial polish
4. **Clear reasoning:** We'll discuss your decisions in the review call

---

## AI / LLM Usage

**We expect you to use AI** to finish this task. However, it is critical you guide the AI to write clean code. All code written / decisions taken in the project will be treated and evaluated as your own.

The software developer’s profession has taken a massive shift in today’s world, and code is no longer the bottleneck. Being able to guide LLMs towards producing clean, maintainable code is; and this is a skill that will only prove to be more and more important as time goes on. Therefore, being able to recognize when the AI follows anti-patterns, makes mistakes on edge cases or isn’t aligned with the positive business outcome of a feature is the most important skill we’re looking for.

---

## Tips

- Don't over-engineer. Lean code that works.
- Use pre-built components for UI (shadcn + TanStack Table is a solid choice)
- Ask questions if something's unclear; that's a plus, not a minus

---

## Submission

1. Email your **Vercel URL + GitHub repo** to [eng-hiring-aaaaspiupw3yn56qzqr6nd3ot4@throxyworkspace.slack.com](mailto:eng-hiring-aaaaspiupw3yn56qzqr6nd3ot4@throxyworkspace.slack.com)
2. We'll schedule a **30-minute review call** to discuss your approach and next steps

**Deadline:** 48 hours from receipt

---

Looking forward to seeing what you build 🚀

~ The Throxy Team
