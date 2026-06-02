import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Image from "next/image";

export default async function ProfilePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  return (
    <main className="min-h-screen p-8 bg-background text-foreground relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-plum-500/20 rounded-full blur-[120px] pointer-events-none -translate-y-1/2 translate-x-1/3" />

      <div className="max-w-2xl mx-auto mt-12 relative z-10">
        <div className="border border-plum-400/20 rounded-3xl p-10 bg-plum-950/70 backdrop-blur-2xl shadow-[0_0_50px_rgba(181,107,194,0.1)]">
          <h1 className="text-4xl font-outfit font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-white via-plum-100 to-plum-400 mb-10 drop-shadow-sm">
            Account Profile
          </h1>
          
          <div className="flex flex-col md:flex-row items-center gap-8 mb-10 pb-10 border-b border-plum-400/20">
            <div className="relative">
              <div className="absolute inset-0 bg-plum-400 rounded-full blur-md opacity-20" />
              {session.user.image ? (
                <Image 
                  src={session.user.image} 
                  alt="Profile Picture" 
                  width={120} 
                  height={120} 
                  className="relative rounded-full border-2 border-plum-400/30 shadow-xl"
                />
              ) : (
                <div className="relative w-[120px] h-[120px] rounded-full bg-plum-900/50 border-2 border-plum-400/30 flex items-center justify-center shadow-xl">
                  <span className="text-4xl text-plum-300/50">?</span>
                </div>
              )}
            </div>
            
            <div className="text-center md:text-left space-y-2">
              <h2 className="text-3xl font-semibold tracking-tight text-plum-100">{session.user.name}</h2>
              <p className="text-plum-300 text-lg">{session.user.email}</p>
              <div className="inline-block mt-2 px-3 py-1 rounded-full bg-plum-800/40 border border-plum-400/20 text-sm text-plum-200">
                Authorized via Google
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="mt-8 p-8 rounded-2xl border border-dashed border-plum-400/30 bg-plum-950/40 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-plum-800/30 flex items-center justify-center mb-2">
                <svg className="w-6 h-6 text-plum-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-plum-200">More Features Coming Soon</h3>
              <p className="text-plum-400/70 text-sm max-w-sm">I'm working on watch history, custom lists, and a deeper analysis of your swiping preferences.</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
