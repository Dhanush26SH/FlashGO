const url = "https://szpfuommfvrfdliloxcg.supabase.co/rest/v1/";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNjg2NjAsImV4cCI6MjA5NDk0NDY2MH0.m6ZZLat8I6sbvTcrB-dEN6cQio3hPIlUmEkxles3O6c";

async function run() {
  const headers = {
    "apikey": key,
    "Authorization": `Bearer ${key}`
  };

  const pRes = await fetch(url + "profiles?role=eq.driver&select=id,full_name", { headers });
  const pData = await pRes.json();
  console.log("Profiles response:", pData);
}
run();
