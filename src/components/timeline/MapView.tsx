"use client";
import { useEffect, useRef, useState, useMemo } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Image as ImageIcon, MapPin, Map as MapIcon } from "lucide-react";
import { config } from "@/config";

interface Photo {
  id: string;
  taken_at: string;
  caption?: string | null;
  place_name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  thumbnail?: string | null;
  image_url?: string | null;
}

interface MapViewProps {
  year: number;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

// Simple trip detection: photos within 7 days + 100km of each other = same trip
function detectTrips(photos: Photo[]): { id: string; photos: Photo[]; centroid: [number, number]; placeName: string; dateRange: string }[] {
  const sorted = [...photos]
    .filter(p => typeof p.latitude === "number" && typeof p.longitude === "number")
    .sort((a, b) => a.taken_at.localeCompare(b.taken_at));

  const trips: Photo[][] = [];
  let current: Photo[] = [];

  function distanceKm(a: Photo, b: Photo): number {
    const R = 6371;
    const dLat = ((b.latitude! - a.latitude!) * Math.PI) / 180;
    const dLon = ((b.longitude! - a.longitude!) * Math.PI) / 180;
    const lat1 = (a.latitude! * Math.PI) / 180;
    const lat2 = (b.latitude! * Math.PI) / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  for (const p of sorted) {
    if (current.length === 0) { current.push(p); continue; }
    const last = current[current.length - 1];
    const daysApart = (new Date(p.taken_at).getTime() - new Date(last.taken_at).getTime()) / (1000 * 60 * 60 * 24);
    const km = distanceKm(last, p);
    if (daysApart <= 7 && km <= 100) {
      current.push(p);
    } else {
      trips.push(current);
      current = [p];
    }
  }
  if (current.length > 0) trips.push(current);

  return trips.map((tripPhotos, i) => {
    const lat = tripPhotos.reduce((s, p) => s + p.latitude!, 0) / tripPhotos.length;
    const lng = tripPhotos.reduce((s, p) => s + p.longitude!, 0) / tripPhotos.length;
    const firstName = tripPhotos.find(p => p.place_name)?.place_name ?? `Trip ${i + 1}`;
    const dateRange = tripPhotos.length === 1
      ? new Date(tripPhotos[0].taken_at).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: config.locale.timezone })
      : `${new Date(tripPhotos[0].taken_at).toLocaleDateString("en-CA", { month: "short", day: "numeric" })} – ${new Date(tripPhotos[tripPhotos.length - 1].taken_at).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}`;
    return { id: `trip-${i}`, photos: tripPhotos, centroid: [lng, lat] as [number, number], placeName: firstName, dateRange };
  });
}

export function MapView({ year }: MapViewProps) {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Photo | null>(null);
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  // Load photos for the year
  useEffect(() => {
    setLoading(true);
    fetch("/api/timeline/photos")
      .then(r => r.json())
      .then(d => {
        const yearStart = `${year}-01-01T00:00:00.000Z`;
        const yearEnd = `${year + 1}-01-01T00:00:00.000Z`;
        const filtered = (d.photos ?? []).filter((p: Photo) =>
          p.taken_at >= yearStart && p.taken_at < yearEnd
        );
        setPhotos(filtered);
      })
      .catch(() => setPhotos([]))
      .finally(() => setLoading(false));
  }, [year]);

  const geoPhotos = useMemo(() => (photos ?? []).filter(p => typeof p.latitude === "number" && typeof p.longitude === "number"), [photos]);
  const noGeoCount = (photos?.length ?? 0) - geoPhotos.length;
  const trips = useMemo(() => detectTrips(geoPhotos), [geoPhotos]);

  // Initialize map
  useEffect(() => {
    if (!MAPBOX_TOKEN || !mapContainer.current || mapRef.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-79.3832, 43.6532], // Toronto default
      zoom: 2,
      attributionControl: false,
    });
    mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    return () => { mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  // Update markers when photos change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !MAPBOX_TOKEN) return;

    // Clear existing markers
    const existing = document.querySelectorAll(".sv-photo-marker");
    existing.forEach(el => el.remove());

    if (geoPhotos.length === 0) return;

    // Add a marker per photo
    geoPhotos.forEach(p => {
      const el = document.createElement("div");
      el.className = "sv-photo-marker";
      el.style.cssText = `
        width: 36px; height: 36px; border-radius: 50%;
        background-size: cover; background-position: center;
        border: 2px solid #1D9BF0; box-shadow: 0 0 12px rgba(29,155,240,0.6), 0 2px 6px rgba(0,0,0,0.5);
        cursor: pointer; transition: transform 0.15s ease;
      `;
      if (p.thumbnail) el.style.backgroundImage = `url(${p.thumbnail})`;
      else el.style.background = "#1D9BF0";

      el.addEventListener("mouseenter", () => { el.style.transform = "scale(1.15)"; });
      el.addEventListener("mouseleave", () => { el.style.transform = "scale(1)"; });
      el.addEventListener("click", () => setSelected(p));

      new mapboxgl.Marker(el).setLngLat([p.longitude!, p.latitude!]).addTo(map);
    });

    // Fit bounds to all markers
    if (geoPhotos.length === 1) {
      map.flyTo({ center: [geoPhotos[0].longitude!, geoPhotos[0].latitude!], zoom: 8, duration: 1000 });
    } else {
      const bounds = new mapboxgl.LngLatBounds();
      geoPhotos.forEach(p => bounds.extend([p.longitude!, p.latitude!]));
      map.fitBounds(bounds, { padding: 60, maxZoom: 10, duration: 1000 });
    }
  }, [geoPhotos]);

  // No Mapbox token configured
  if (!MAPBOX_TOKEN) {
    return (
      <Card className="flex flex-col gap-3">
        <EmptyState
          icon={MapIcon}
          title="Mapbox token missing"
          body="Add NEXT_PUBLIC_MAPBOX_TOKEN to Vercel env vars (free tier — sign up at mapbox.com) then redeploy."
          size="md"
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Stats strip */}
      {!loading && photos && photos.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <p className="text-[10px] uppercase tracking-widest text-text-3">Photos</p>
            <p className="text-[20px] font-700 tabular-nums">{photos.length}</p>
          </Card>
          <Card>
            <p className="text-[10px] uppercase tracking-widest text-text-3">Trips</p>
            <p className="text-[20px] font-700 tabular-nums">{trips.length}</p>
          </Card>
          <Card>
            <p className="text-[10px] uppercase tracking-widest text-text-3">Located</p>
            <p className="text-[20px] font-700 tabular-nums">{geoPhotos.length}<span className="text-[11px] text-text-3 font-400 ml-1">/{photos.length}</span></p>
          </Card>
        </div>
      )}

      {/* Map */}
      <Card className="!p-0 overflow-hidden">
        {loading ? (
          <div className="h-[500px] flex items-center justify-center">
            <Skeleton width="80%" height={400} />
          </div>
        ) : !photos || photos.length === 0 ? (
          <div className="h-[400px]">
            <EmptyState
              icon={MapPin}
              title="No photos for this year"
              body="Set up the iCloud Shortcut (tomorrow) to start syncing photos automatically. They'll appear pinned to the map by their GPS coordinates."
              size="lg"
              className="h-full"
            />
          </div>
        ) : geoPhotos.length === 0 ? (
          <div className="h-[400px]">
            <EmptyState
              icon={ImageIcon}
              title={`${photos.length} photos · no location data`}
              body="None of this year's synced photos have GPS coordinates. They'll appear in the Feed view but not on the map."
              size="md"
              className="h-full"
            />
          </div>
        ) : (
          <div ref={mapContainer} className="w-full" style={{ height: "calc(100vh - 320px)", minHeight: "440px" }} />
        )}
      </Card>

      {/* Trips list */}
      {!loading && trips.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <MapPin size={13} className="text-accent" />
            <p className="text-[11px] font-700 uppercase tracking-[0.16em] text-text-2">Detected Trips</p>
          </div>
          <div className="flex flex-col gap-2">
            {trips.slice(0, 10).map(trip => (
              <button
                key={trip.id}
                onClick={() => mapRef.current?.flyTo({ center: trip.centroid, zoom: 9, duration: 1000 })}
                className="flex items-center gap-3 px-3 py-2 rounded-[10px] bg-[rgba(255,255,255,0.03)] border border-border-dim hover:border-[rgba(29,155,240,0.28)] text-left transition-all"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-600 text-text-1 truncate">{trip.placeName}</p>
                  <p className="text-[11px] text-text-3">{trip.dateRange} · {trip.photos.length} photo{trip.photos.length === 1 ? "" : "s"}</p>
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}

      {noGeoCount > 0 && (
        <p className="text-center text-[11px] text-text-3">
          {noGeoCount} photo{noGeoCount === 1 ? "" : "s"} missing GPS data (not shown on map)
        </p>
      )}

      {/* Selected photo modal */}
      {selected && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center px-4 bg-black/70 backdrop-blur-md"
          style={{ animation: "fade-in 0.2s var(--ease-glide) both" }}
          onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}
        >
          <div
            className="glass-3 w-full max-w-[440px] rounded-[20px] overflow-hidden"
            style={{ animation: "scale-in 0.24s var(--ease-spring) both" }}
          >
            {(selected.thumbnail || selected.image_url) && (
              <div className="aspect-video bg-[rgba(255,255,255,0.03)] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selected.image_url ?? selected.thumbnail!} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="p-5 flex flex-col gap-2">
              <p className="text-[10px] uppercase tracking-widest text-text-3">
                {new Date(selected.taken_at).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: config.locale.timezone })}
              </p>
              <p className="text-[15px] font-600 text-text-1">{selected.caption || selected.place_name || "Photo"}</p>
              {selected.place_name && (
                <p className="text-[11px] text-text-3 inline-flex items-center gap-1">
                  <MapPin size={11} /> {selected.place_name}
                </p>
              )}
              <button
                onClick={() => setSelected(null)}
                className="self-end text-[11px] text-text-3 hover:text-accent transition-colors mt-1"
              >Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
