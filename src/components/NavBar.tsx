import { auth, signIn, signOut } from "@/auth";
import Link from "next/link";

export default async function NavBar() {
  const session = await auth();

  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 bg-black/40 backdrop-blur-xl border-b border-white/5 text-white">
      <Link href="/" className="text-2xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60 hover:opacity-80 transition-opacity">
        What to watch
      </Link>
      
      <div className="flex items-center gap-6">
        {session?.user ? (
          <>
            <Link href="/profile" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">
              Profile
            </Link>
            <form
              action={async () => {
                "use server";
                await signOut();
              }}
            >
              <button type="submit" className="text-sm font-medium px-5 py-2 rounded-full bg-white/5 hover:bg-red-500/90 hover:text-white hover:border-red-500/90 border border-white/10 transition-all">
                Sign Out
              </button>
            </form>
          </>
        ) : (
          <form
            action={async () => {
              "use server";
              await signIn("google");
            }}
          >
            <button type="submit" className="text-sm font-medium bg-white text-black hover:bg-gray-200 px-6 py-2.5 rounded-full transition-transform active:scale-95 shadow-[0_0_15px_rgba(255,255,255,0.15)]">
              Sign In
            </button>
          </form>
        )}
      </div>
    </nav>
  );
}
