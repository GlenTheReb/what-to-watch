const { fetchTVRecommendations, searchMulti } = require('./.next/server/app/api/deck/route.js');
async function run() {
  const sr = await searchMulti("Game of Thrones");
  console.log("Found:", sr[0].id, sr[0].name);
  const recs = await fetchTVRecommendations(sr[0].id);
  console.log("Recs:", recs.slice(0, 5).map(r => r.name));
}
run().catch(console.error);
