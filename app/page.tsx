export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">What to watch</h1>
        <p className="text-gray-400">Stop scrolling. Start watching.</p>

        <input
          placeholder="Type anything…"
          className="mt-6 w-80 px-4 py-3 rounded bg-gray-900 border border-gray-700 focus:outline-none focus:border-white"
        />

        <button className="block mx-auto mt-4 px-6 py-3 bg-white text-black rounded font-medium">
          Get picks
        </button>
      </div>
    </main>
  );
}
