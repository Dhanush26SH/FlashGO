async function test() {
  const response = await fetch('https://szpfuommfvrfdliloxcg.supabase.co/functions/v1/create-razorpay-order', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      orderId: "c073dc66-19d5-44f9-8313-bdd1d1aaf83f"
    })
  });
  const text = await response.text();
  console.log("Status:", response.status);
  console.log("Body:", text);
}
test();
