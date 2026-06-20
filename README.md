# 🏔️ OLK — Open Library Kashmir

> *Fostering a culture of reading and sharing in Kashmir, one book at a time.*

**OLK** is a modern, community‑driven platform where readers in Kashmir can share their personal libraries, request books, and engage in meaningful literary connections. Built with a robust, type‑safe stack, it bridges the gap between physical books and digital convenience.

---

## ✨ Core Features

- 📚 **Community Book Sharing** – List books you own and are willing to lend to others.
- 🤝 **Seamless Requesting** – Browse available books and request to borrow them directly.
- 💬 **Messaging System** – Coordinate book pickups and drop‑offs via dedicated 1‑on‑1 chat.
- 🔔 **Real‑time Notifications** – Get instantly notified when your books are requested or messages are received.
- 🌟 **Book of the Month** – A curated selection to encourage community‑wide reading.
- 🛡️ **Reporting & Moderation** – Keep the community safe with a built‑in reporting modal for users and books.
- ⚙️ **Admin Dashboard** – Specialized view for community moderators to manage reports and content.
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

---

## 🚀 Getting Started

### Prerequisites

- Node.js `18.18.0` or later
- `npm`, `yarn`, or `pnpm`
- A [Supabase](https://supabase.com/) account and project

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

### 3. Link to Your Supabase Project

If you have the Supabase CLI installed, you can link your local repository to your remote Supabase project. This syncs your database types and configurations:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
```

> Your project ref can be found in `supabase/.temp/linked-project.json` after linking.

### 4. Configure Environment Variables

Create a `.env.local` file in the root directory and add your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 5. Set Up the Database Schema

### 5. Set Up the Database Schema

The repository includes a complete SQL schema file at `supabase/schema.sql`. This file contains all the table definitions, relationships, and Row Level Security (RLS) policies needed for the application.

You can apply it in one of two ways:

- **Using the Supabase SQL Editor** – Open your project’s SQL Editor, copy the entire content of `supabase/schema.sql`, and run it.
- **Using the Supabase CLI** (if you have it installed) – run the following command from the root of your project:

```bash
npx supabase db push
```
### 6. Run the Development Server

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
│   │   ├── (dashboard)/       # 🔒 Protected routes (Auth required via Middleware)
│   │   │   ├── admin/         # ⚙️ Admin panel for moderation
│   │   │   ├── browse/        # 📚 Browse available books
│   │   │   ├── messages/      # 💬 1‑on‑1 chat interface
│   │   │   ├── my-books/      # 📖 Manage your listed books
│   │   │   ├── notifications/ # 🔔 View alerts
│   │   │   ├── profile/       # 👤 Edit display name & area
│   │   │   └── requests/      # 🤝 Handle borrow requests
│   │   ├── login/             # 🔑 Auth: Login
│   │   ├── register/          # 📝 Auth: Registration
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
│   └── middleware.ts          # Route protection for (dashboard)
├── supabase/
│   └── .temp/                 # Supabase CLI linked project config
└── ...config files
```

---

## 🔒 Security & Routing

Route protection is handled elegantly via `src/middleware.ts`. It checks for an active Supabase session before allowing access to any routes inside the `(dashboard)` group. Unauthenticated users are seamlessly redirected to `/login`.

```typescript
// src/middleware.ts
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })
  const { data: { session } } = await supabase.auth.getSession()

  const protectedRoutes = ['/my-books', '/messages', '/requests', '/profile', '/notifications', '/admin']
  const isProtected = protectedRoutes.some(route => req.nextUrl.pathname.startsWith(route))

  if (isProtected && !session) {
    const redirectUrl = new URL('/login', req.url)
    redirectUrl.searchParams.set('redirectTo', req.nextUrl.pathname)
    return NextResponse.redirect(redirectUrl)
  }

  return res
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|login|register).*)'],
}
```

---

## 📜 Available Scripts

| Command          | Description                                    |
| ---------------- | ---------------------------------------------- |
| `npm run dev`    | Starts the development server on `localhost:3000` |
| `npm run build`  | Builds the application for production          |
| `npm run start`  | Starts the production server                   |
| `npm run lint`   | Runs ESLint to analyze code quality            |

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

- [Next.js](https://nextjs.org/)
- [Supabase](https://supabase.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Vercel](https://vercel.com/)

---

**Happy reading & sharing!** 📖✨