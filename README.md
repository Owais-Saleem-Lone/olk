# OLK — Open Library Kashmir

> Every book has already changed someone's life. Now it can change yours.

OLK is a community-built platform where books don't collect dust on shelves — they travel.
Readers across regions donate and lend their books to strangers who become neighbours,
and neighbours who become friends. No fees. No algorithms. No middlemen.
Just people, and the stories that connect them.

---

## How?

Its web application is a tool where people can:

- **List books** they want to donate or lend
- **Browse and search** the community's available books by title, author, or genre
- **Request books** from other members and manage incoming/outgoing requests
- **Message** other members to coordinate in-person exchanges
- **See a featured "Book of the Month"** curated by the administrator

Anyone can browse books without an account. Creating an account (free) unlocks requesting books, listing your own, and messaging.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19 + Tailwind CSS v4 |
| Backend / Database | Supabase (PostgreSQL + Auth + Storage) |
| Language | TypeScript 5 |
| Auth | Supabase email + password via `@supabase/ssr` |

---

## Prerequisites

Before you begin, make sure you have the following installed:

| Tool | Minimum Version | Purpose |
|---|---|---|
| Node.js | 18.17 or later | JavaScript runtime |
| npm | comes with Node.js | Package manager |
| Git | any recent version | Cloning the repo |

You also need a free **Supabase** account at [supabase.com](https://supabase.com) to provide the database and authentication backend.

---

## Installation: for developers

### Step 1 — Install Node.js

<details>
<summary><strong>Linux (Ubuntu / Debian)</strong></summary>

```bash
# Install Node.js 20 LTS via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node -v
npm -v
```

</details>

<details>
<summary><strong>Linux (Fedora / RHEL / CentOS)</strong></summary>

```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

# Verify
node -v
npm -v
```

</details>

<details>
<summary><strong>Windows</strong></summary>

1. Go to [nodejs.org](https://nodejs.org/en/download) and download the **LTS** installer (`.msi`)
2. Run the installer and follow the prompts (keep all defaults)
3. Open **Command Prompt** or **PowerShell** and verify:

```powershell
node -v
npm -v
```

> Tip: Windows users may prefer [Windows Terminal](https://aka.ms/terminal) for a better experience.

</details>

---

### Step 2 — Install Git

<details>
<summary><strong>Linux</strong></summary>

```bash
sudo apt-get install -y git    # Ubuntu/Debian
# or
sudo dnf install -y git        # Fedora
```

</details>

<details>
<summary><strong>Windows</strong></summary>

Download and install from [git-scm.com](https://git-scm.com/download/win). During setup, choose **"Git from the command line and also from 3rd-party software"** when prompted.

</details>

---

### Step 3 — Clone the Repository

**Linux & Windows (same command):**

```bash
git clone https://github.com/YOUR_USERNAME/olk.git
cd olk
```

> Replace `YOUR_USERNAME` with the actual GitHub username.

---

### Step 4 — Install Dependencies

**Linux & Windows (same command):**

```bash
npm install
```

This installs everything listed in `package.json` — Next.js, React, Tailwind, Supabase client, and all dev tools. It may take a minute.

---

### Step 5 — Set Up Supabase

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Click **New Project**, give it a name (e.g. `olk`), choose a region close to Kashmir (e.g. Mumbai or Singapore), and set a strong database password
3. Wait for the project to be created (~1 minute)
4. Go to **Project Settings → API** and copy:
   - **Project URL** (looks like `https://xxxx.supabase.co`)
   - **anon / public key** (a long JWT string)

---

### Step 6 — Create the Database Tables

In your Supabase dashboard go to **SQL Editor** and run these queries **one at a time**:

**Query 1 — Profiles table:**
```sql
CREATE TABLE public.profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  display_name text,
  area_name text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all profiles" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
```

**Query 2 — Books table:**
```sql
CREATE TABLE public.books (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  author text,
  condition text CHECK (condition IN ('excellent','good','fair','poor')),
  listing_type text NOT NULL CHECK (listing_type IN ('donate','lend')),
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','unavailable','given')),
  genre text,
  cover_url text,
  owner_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view available books" ON public.books
  FOR SELECT TO anon, authenticated USING (status = 'available');

CREATE POLICY "Authenticated users can view all books" ON public.books
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert own books" ON public.books
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own books" ON public.books
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own books" ON public.books
  FOR DELETE USING (auth.uid() = owner_id);
```

**Query 3 — Book requests table:**
```sql
CREATE TABLE public.book_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  book_id uuid REFERENCES public.books ON DELETE CASCADE NOT NULL,
  requester_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.book_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view requests for their books" ON public.book_requests
  FOR SELECT USING (
    auth.uid() = requester_id OR
    auth.uid() = (SELECT owner_id FROM public.books WHERE id = book_id)
  );

CREATE POLICY "Users can insert requests" ON public.book_requests
  FOR INSERT WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Book owners can update request status" ON public.book_requests
  FOR UPDATE USING (
    auth.uid() = (SELECT owner_id FROM public.books WHERE id = book_id)
  );
```

**Query 4 — Book of the Month table:**
```sql
CREATE TABLE public.book_of_month (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  author text,
  description text,
  cover_url text,
  month_label text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.book_of_month ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view book of month" ON public.book_of_month
  FOR SELECT USING (true);
```

**Query 5 — Auto-create profile on signup:**
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (new.id);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

### Step 7 — Set Up Storage (for book cover images)

In the Supabase dashboard go to **Storage** and:

1. Click **New bucket**
2. Name it `book-covers`
3. Make it **Public**
4. Click **Create**

Then go to **Storage → Policies** and add this policy for `book-covers`:

```sql
CREATE POLICY "Anyone can view book covers" ON storage.objects
  FOR SELECT USING (bucket_id = 'book-covers');

CREATE POLICY "Authenticated users can upload covers" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'book-covers' AND auth.role() = 'authenticated');

CREATE POLICY "Users can delete own covers" ON storage.objects
  FOR DELETE USING (bucket_id = 'book-covers' AND auth.uid()::text = (storage.foldername(name))[1]);
```

---

### Step 8 — Configure Environment Variables

Create a file called `.env.local` in the root of the project:

**Linux:**
```bash
touch .env.local
```

**Windows (PowerShell):**
```powershell
New-Item .env.local -ItemType File
```

Open `.env.local` in any text editor and add:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

Replace the values with what you copied in Step 5. Save the file.

> **Important:** Never commit `.env.local` to Git. It is already listed in `.gitignore`.

---

### Step 9 — Run the Development Server

**Linux & Windows (same command):**

```bash
npm run dev
```

Open your browser and go to:

```
http://localhost:3000
```

The app hot-reloads as you edit files — no need to restart.

---

## Available Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the local development server |
| `npm run build` | Build the app for production |
| `npm run start` | Run the production build locally |
| `npm run lint` | Check code for lint errors |

---

## Project Structure

```
olk/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Public homepage
│   │   ├── login/                # Login page
│   │   ├── register/             # Registration page
│   │   └── (dashboard)/          # Authenticated layout
│   │       ├── browse/           # Browse & search books
│   │       ├── my-books/         # Add and manage your books
│   │       ├── requests/         # Incoming & outgoing requests
│   │       ├── profile/          # Edit display name & location
│   │       └── messages/         # Messaging (coming soon)
│   ├── components/
│   │   ├── dashboard-sidebar.tsx # Sidebar nav for logged-in users
│   │   └── book-of-month.tsx     # Book of the Month card + modal
│   ├── lib/
│   │   └── supabase/
│   │       ├── client.ts         # Browser-side Supabase client
│   │       └── server.ts         # Server-side Supabase client
│   └── middleware.ts             # Protects authenticated routes
├── .env.local                    # Your secrets (not committed)
├── package.json
└── README.md
```

---

## Deployment

The easiest way to deploy OLK is on **Vercel** (free tier available):

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) and import your repository
3. In the project settings, add your environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Click **Deploy**

Vercel automatically rebuilds and redeploys on every push to `main`.

---

## Adding a Book of the Month

As the administrator, update the featured book by running these two queries in the Supabase SQL Editor each month:

**Query 1 — Deactivate the current book:**
```sql
UPDATE public.book_of_month SET active = false WHERE active = true;
```

**Query 2 — Add the new book:**
```sql
INSERT INTO public.book_of_month (title, author, description, cover_url, month_label, active)
VALUES (
  'Book Title',
  'Author Name',
  'Your description — why you chose this book this month.',
  'https://link-to-cover-image.jpg',
  'July 2026',
  true
);
```

---

## Contributing

This project is built for the people of Kashmir. Contributions, suggestions, and bug reports are welcome. Open an issue or submit a pull request on GitHub.

---

## License

MIT — free to use, modify, and distribute.

---

*Built with love for the readers of Kashmir.*
