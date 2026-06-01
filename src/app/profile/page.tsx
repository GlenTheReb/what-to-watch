import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Image from "next/image";

export default async function ProfilePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  return (
    <main className="min-h-screen p-8 bg-black text-white relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-white/5 rounded-full blur-[120px] pointer-events-none -translate-y-1/2 translate-x-1/3" />

      <div className="max-w-2xl mx-auto mt-12 relative z-10">
        <div className="border border-white/10 rounded-3xl p-10 bg-white/5 backdrop-blur-2xl shadow-2xl">
          <h1 className="text-4xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60 mb-10">
            Account Profile
          </h1>
          
          <div className="flex flex-col md:flex-row items-center gap-8 mb-10 pb-10 border-b border-white/10">
            <div className="relative">
              <div className="absolute inset-0 bg-white rounded-full blur-md opacity-20" />
              {session.user.image ? (
                <Image 
                  src={session.user.image} 
                  alt="Profile Picture" 
                  width={120} 
                  height={120} 
                  className="relative rounded-full border border-white/20 shadow-xl"
                />
              ) : (
                <div className="relative w-[120px] h-[120px] rounded-full bg-white/5 border border-white/20 flex items-center justify-center shadow-xl">
                  <span className="text-4xl text-white/50">?</span>
                </div>
              )}
            </div>
            
            <div className="text-center md:text-left space-y-2">
              <h2 className="text-3xl font-semibold tracking-tight">{session.user.name}</h2>
              <p className="text-gray-400 text-lg">{session.user.email}</p>
              <div className="inline-block mt-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-sm text-gray-300">
                Authorized via Google
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="p-6 bg-black/40 rounded-2xl border border-white/5 hover:border-white/10 transition-colors">
              <h3 className="font-semibold text-gray-300 mb-1">Database Status</h3>
              <p className="text-emerald-400/90 font-medium flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Active and synced with Neon Postgres
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
