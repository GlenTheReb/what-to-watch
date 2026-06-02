import { auth, signIn, signOut } from "@/auth";
import Link from "next/link";

export default async function NavBar() {
  const session = await auth();

  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 bg-plum-950/70 backdrop-blur-xl border-b border-plum-400/20 text-plum-100 shadow-sm shadow-plum-900/50 transition-all duration-300">
      <Link href="/" className="text-2xl font-outfit font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-white via-plum-100 to-plum-400 hover:scale-105 transition-transform drop-shadow-lg">
        What to watch
      </Link>
      
      <div className="flex items-center gap-6">
        {session?.user ? (
          <>
            <Link href="/profile" className="text-sm font-medium text-plum-400 hover:text-plum-100 transition-colors">
              Profile
            </Link>
            <form
              action={async () => {
                "use server";
                await signOut();
              }}
            >
              <button type="submit" className="text-sm font-medium px-5 py-2 rounded-full bg-plum-800/30 hover:bg-plum-500/80 hover:text-white hover:border-plum-400 border border-plum-400/20 transition-all shadow-[0_0_10px_rgba(181,107,194,0.1)]">
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
            <button type="submit" className="text-sm font-medium bg-plum-100 text-plum-950 hover:bg-white px-6 py-2.5 rounded-full transition-transform active:scale-95 shadow-[0_0_15px_rgba(181,107,194,0.2)] hover:shadow-[0_0_20px_rgba(181,107,194,0.4)]">
              Sign In
            </button>
          </form>
        )}
      </div>
    </nav>
  );
}
