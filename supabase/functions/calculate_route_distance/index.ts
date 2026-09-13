import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { trip_id } = await req.json();
    if (!trip_id) {
      return new Response(JSON.stringify({ success: false, error: "Missing trip_id" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // 1. Get trip, warehouse, and order coordinates
    const { data: trip, error: tripError } = await supabaseClient
      .from("logistics_trips")
      .select(`
        id, warehouse_id, 
        warehouses ( lat, lng ),
        orders ( delivery_lat, delivery_lng )
      `)
      .eq("id", trip_id)
      .single();

    if (tripError || !trip) {
      return new Response(JSON.stringify({ success: false, error: "Trip not found or unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const whLat = trip.warehouses?.lat;
    const whLng = trip.warehouses?.lng;
    // Assuming single order per trip for now
    const order = Array.isArray(trip.orders) ? trip.orders[0] : trip.orders;
    const delLat = order?.delivery_lat;
    const delLng = order?.delivery_lng;

    console.log("ROUTE_DISTANCE_WAREHOUSE_COORDS", { hasLat: !!whLat, hasLng: !!whLng });
    console.log("ROUTE_DISTANCE_CUSTOMER_COORDS", { hasLat: !!delLat, hasLng: !!delLng });

    if (!whLat || !whLng || !delLat || !delLng || !Number.isFinite(whLat) || !Number.isFinite(whLng) || !Number.isFinite(delLat) || !Number.isFinite(delLng)) {
      console.log("ROUTE_DISTANCE_ERROR", "Invalid or missing coordinates");
      return new Response(JSON.stringify({ success: false, error: "Missing or invalid coordinates" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Call OSRM
    const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${whLng},${whLat};${delLng},${delLat}?overview=false`;
    console.log("ROUTE_DISTANCE_OSRM_REQUEST");
    
    let distanceMeters = 0;
    try {
      const osrmResponse = await fetch(osrmUrl);
      if (!osrmResponse.ok) {
        throw new Error("OSRM API failed with status: " + osrmResponse.status);
      }
      const osrmData = await osrmResponse.json();
      if (osrmData.code !== "Ok" || !osrmData.routes || osrmData.routes.length === 0) {
        throw new Error("Invalid OSRM response code: " + osrmData.code);
      }
      distanceMeters = osrmData.routes[0].distance;
      console.log("ROUTE_DISTANCE_OSRM_RESULT", { success: true });
    } catch (e: any) {
      console.error("ROUTE_DISTANCE_ERROR", "OSRM Error:", e.message);
      return new Response(JSON.stringify({ success: false, error: "ROUTE_DISTANCE_UNAVAILABLE" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Persist to DB securely using Admin client
    const { error: updateError } = await supabaseAdmin
      .from("logistics_trips")
      .update({ route_distance_meters: distanceMeters })
      .eq("id", trip_id);

    if (updateError) {
      console.error("DB Update Error:", updateError);
      return new Response(JSON.stringify({ success: false, error: "Failed to persist distance" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, distance_meters: distanceMeters }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error(error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
