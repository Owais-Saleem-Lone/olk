# 🏔️ OLK — Open Library Kashmir

> *Fostering a culture of reading and sharing in Kashmir, one book at a time.*

**OLK** is a modern, community‑driven platform where readers in Kashmir can share their personal libraries, request books, and engage in meaningful literary connections. Built with a robust, type‑safe stack, it bridges the gap between physical books and digital convenience.

---

## ✨ Core Features

- 📚 **Community Book Sharing** – List books you own and are willing to lend to others.
- 🤝 **Seamless Requesting** – Browse available books and request to borrow them directly.
- ✨ **Wishlist & Smart Matching** – Ask for a book you can't find, and get notified the moment someone nearby lists a match.
- 🏘️ **Local Clubs** – Create or join interest-based reading clubs once you've built up trust in the community.
- 💬 **Messaging System** – Coordinate book pickups and drop‑offs via dedicated 1‑on‑1 chat.
- 🔔 **Real‑time Notifications** – Get instantly notified when your books are requested or messages are received.
- 🌟 **Book of the Month** – A curated selection to encourage community‑wide reading.
- 🛡️ **Reporting & Moderation** – Keep the community safe with a built‑in reporting modal for users and books.
- ⚙️ **Admin Dashboard** – Specialized view for moderators to manage reports and content, with platform-wide feature flags and a maintenance-mode switch.
- 🔐 **Secure Authentication** – Robust user auth and route protection powered by Supabase.

---

## 🛠 Tech Stack

| Technology       | Description                                  |
| ---------------- | -------------------------------------------- |
| **Next.js**      | App Router, Server Components, and SSR       |
| **React 19**     | Modern UI with Client/Server separation      |
| **TypeScript**   | End‑to‑end type safety                       |
| **Supabase**     | Auth, PostgreSQL Database, Realtime & Storage|
| **Tailwind CSS** | Utility‑first styling for rapid UI dev       |
| **Vercel**       | Seamless deployment and hosting              |
| **Vitest**       | Unit tests, run automatically in CI          |
| **GitHub Actions** | Lint + test on every push and pull request |

---

## 🚀 Getting Started

### Prerequisites

- Node.js `18.18.0` or later
- `npm`, `yarn`, or `pnpm`
- [Docker](https://docs.docker.com/get-docker/) (for running Supabase locally — recommended)
- A [Supabase](https://supabase.com/) account and project (only needed if you want to talk to the hosted/remote database instead)

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/olk.git
cd olk
```

### 2. Install Dependencies

```bash
npm install
# or
yarn install
# or
pnpm install
```

### 3. Run Supabase Locally with Docker (recommended)

Instead of relying on the hosted database for every code change, you can run the whole Supabase stack (Postgres, Auth, Storage, Realtime, Studio) locally via Docker. The Supabase CLI drives Docker for you — you never touch `docker compose` directly.

```bash
# one-time: creates supabase/config.toml (already committed here, so you can skip this)
npx supabase init

# starts the local stack (pulls images on first run)
npx supabase start

# applies every migration in supabase/migrations to the local database
npx supabase db reset
```

`supabase start` prints a block of local credentials. Point the app at them in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<the ANON_KEY printed by `supabase start`>
```

Useful local endpoints:

| Service | URL |
| --- | --- |
| API | http://127.0.0.1:54321 |
| Studio (DB browser/UI) | http://127.0.0.1:54323 |
| Inbucket/Mailpit (catches auth emails) | http://127.0.0.1:54324 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

Day-to-day commands:

```bash
npx supabase stop        # stop the containers (data persists in a Docker volume)
npx supabase start       # start them again
npx supabase db reset    # wipe the local DB and replay all migrations from scratch
npx supabase status      # print the local credentials again
```

Since `NEXT_PUBLIC_SUPABASE_URL` in `.env.local` decides where the app talks, switching between local and remote is just swapping that file's values — a backup of the remote credentials is kept in `.env.remote` (gitignored, not read by Next.js) for quick reference.

### 4. Link to Your Supabase Project (only if using the remote database)

If you have the Supabase CLI installed, you can link your local repository to your remote Supabase project. This syncs your database types and configurations:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
```

> Your project ref can be found in `supabase/.temp/linked-project.json` after linking.

### 5. Configure Environment Variables

Create a `.env.local` file in the root directory and add your Supabase credentials (skip this if you're using the local Docker stack from step 3 — its `.env.local` values are already set):

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 6. Set Up the Database Schema

The repository includes a complete SQL schema file at `supabase/schema.sql`. This file contains all the table definitions, relationships, and Row Level Security (RLS) policies needed for the application.

You can apply it in one of two ways:

- **Using the Supabase SQL Editor** – Open your project’s SQL Editor, copy the entire content of `supabase/schema.sql`, and run it.
- **Using the Supabase CLI** (if you have it installed) – run the following command from the root of your project:

```bash
npx supabase db push
```
### 7. Run the Development Server

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

---

## 📁 Project Architecture

The codebase is structured for scalability, leveraging Next.js App Router and Server Components.

```
.
├── src/
│   ├── app/
│   │   ├── (dashboard)/       # 🔒 Protected routes (Auth required via Proxy)
│   │   │   ├── admin/         # ⚙️ Admin panel for moderation
│   │   │   ├── browse/        # 📚 Browse available books
│   │   │   ├── clubs/         # 🏘️ Local reading clubs
│   │   │   ├── messages/      # 💬 1‑on‑1 chat interface
│   │   │   ├── my-books/      # 📖 Manage your listed books
│   │   │   ├── notifications/ # 🔔 View alerts
│   │   │   ├── profile/       # 👤 Edit display name & area
│   │   │   ├── requests/      # 🤝 Handle borrow requests
│   │   │   ├── saved/         # 🔖 Bookmarked books
│   │   │   ├── user/          # Public profile pages
│   │   │   └── wishlist/      # ✨ Wishlist & smart matching
│   │   ├── api/digest/        # 📧 Weekly email digest cron endpoint
│   │   ├── login/             # 🔑 Auth: Login
│   │   ├── register/          # 📝 Auth: Registration
│   │   ├── maintenance/       # 🚧 Shown when maintenance mode is on
│   │   ├── layout.tsx         # Root layout (Fonts, Globals)
│   │   └── page.tsx           # Landing Page & Book of the Month
│   ├── components/
│   │   ├── about-modal.tsx    # Info modal
│   │   ├── book-of-month.tsx  # Featured book UI
│   │   ├── dashboard-shell.tsx# Responsive layout wrapper
│   │   ├── dashboard-sidebar.tsx # Navigation & user menu
│   │   ├── notification-bell.tsx # Header alert component
│   │   └── report-modal.tsx   # 🛡️ Moderation reporting UI
│   ├── lib/
│   │   └── supabase/
│   │       ├── client.ts      # Supabase Browser Client
│   │       └── server.ts      # Supabase Server Client (SSR)
│   └── proxy.ts               # Route protection for (dashboard)
├── supabase/
│   └── .temp/                 # Supabase CLI linked project config
└── ...config files
```

---

## 🔒 Security & Routing

To keep your data safe, **OLK** uses a dedicated Proxy layer (Next.js 16's rename of Middleware) that intercepts every request before it reaches a page.

- All routes inside the `(dashboard)` folder are **protected** – they require a valid Supabase session.  
- If a user tries to access these pages without being logged in, they are automatically redirected to the `/login` page.  
- The same layer also enforces platform-wide feature flags and maintenance mode.

The logic lives in `src/proxy.ts` and is fully integrated with Supabase’s authentication helpers. This approach gives you a clean, server‑side security layer without cluttering your components with auth checks.

## 📜 Available Scripts

| Command          | Description                                    |
| ---------------- | ---------------------------------------------- |
| `npm run dev`    | Starts the development server on `localhost:3000` |
| `npm run build`  | Builds the application for production          |
| `npm run start`  | Starts the production server                   |
| `npm run lint`   | Runs ESLint to analyze code quality            |
| `npm test`       | Runs the Vitest unit test suite                |

---

## 🌟 Adding a "Book of the Month"

To update the featured book, insert a new row into the `book_of_the_month` table in Supabase:

```sql
INSERT INTO book_of_the_month (title, author, description, cover_url, active)
VALUES (
  'The Kashmir Files',
  'Author Name',
  'A gripping tale set in the valley...',
  'https://your-supabase-storage-url/cover.jpg',
  true
);
```

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!  
Feel free to check the [issues page](https://github.com/your-username/olk/issues).

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

## 🙏 Acknowledgements

This project wouldn't have been possible without the incredible open‑source tools and communities that power it. Special thanks to:

- **[Next.js](https://nextjs.org/)** – for the React framework that makes full‑stack development a joy.
- **[Supabase](https://supabase.com/)** – for providing a rock‑solid backend with authentication and realtime features.
- **[Tailwind CSS](https://tailwindcss.com/)** – for the utility‑first CSS framework that kept the UI clean and fast.
- **[Vercel](https://vercel.com/)** – for seamless hosting and a smooth deployment experience.

And to the entire open‑source community for continuously pushing the boundaries of web development.

**Happy reading & sharing!** 📖✨