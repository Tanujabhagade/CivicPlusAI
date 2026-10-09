import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { CivicIssue } from "@/lib/civic-data";

export type MapPosition = {
  latitude: number;
  longitude: number;
  label?: string;
};

type CivicGeoMapProps = {
  issues?: CivicIssue[];
  selectedPosition?: MapPosition;
  onLocationSelect?: (position: MapPosition) => void;
  onIssue?: (id: string) => void;
  height?: string;
  interactive?: boolean;
};

const defaultPosition: MapPosition = {
  latitude: 19.77,
  longitude: 74.55,
  label: "CivicPulse supported areas",
};

export function CivicGeoMap({
  issues = [],
  selectedPosition,
  onLocationSelect,
  onIssue,
  height = "360px",
  interactive = true,
}: CivicGeoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const locationSelectRef = useRef(onLocationSelect);
  const issueOpenRef = useRef(onIssue);

  useEffect(() => {
    locationSelectRef.current = onLocationSelect;
    issueOpenRef.current = onIssue;
  }, [onLocationSelect, onIssue]);

  useEffect(() => {
    let disposed = false;
    void import("leaflet").then((mod) => {
      const L =
        (mod as unknown as { default?: typeof import("leaflet") }).default ??
        (mod as unknown as typeof import("leaflet"));

      if (disposed || !containerRef.current || mapRef.current) return;

      const initial = selectedPosition ?? defaultPosition;
      const map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: true,
      }).setView([initial.latitude, initial.longitude], 11);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      const layer = L.layerGroup().addTo(map);

      if (interactive) {
        map.on("click", (event: { latlng: { lat: number; lng: number } }) =>
          locationSelectRef.current?.({
            latitude: event.latlng.lat,
            longitude: event.latlng.lng,
            label: "Selected on map",
          }),
        );
      }

      leafletRef.current = L;
      mapRef.current = map;
      layerRef.current = layer;
      window.setTimeout(() => map.invalidateSize(), 100);
    });

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
      leafletRef.current = null;
    };
  }, [interactive]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    const L = leafletRef.current;
    if (!map || !layer || !L) return;

    layer.clearLayers();

    issues.forEach((issue) => {
      const latitude = issue.latitude ?? issue.lat;
      const longitude = issue.longitude ?? 74.55;
      const color =
        issue.priority === "Critical"
          ? "#e11d48"
          : issue.priority === "High"
            ? "#f97316"
            : issue.priority === "Medium"
              ? "#eab308"
              : "#16a34a";

      const marker = L.circleMarker([latitude, longitude], {
        radius: 7,
        color: "#ffffff",
        weight: 2,
        fillColor: color,
        fillOpacity: 0.95,
      });

      marker.bindPopup(
        `<strong>${issue.id}</strong><br/>${issue.title}<br/><small>${issue.location} • ${issue.status}</small>`,
      );
      marker.on("click", () => issueOpenRef.current?.(issue.id));
      marker.addTo(layer);
    });

    if (selectedPosition) {
      const marker = L.circleMarker([selectedPosition.latitude, selectedPosition.longitude], {
        radius: 10,
        color: "#0f766e",
        weight: 3,
        fillColor: "#14b8a6",
        fillOpacity: 0.9,
      });

      marker.bindPopup(
        `<strong>${selectedPosition.label ?? "Selected location"}</strong><br/>${selectedPosition.latitude.toFixed(5)}, ${selectedPosition.longitude.toFixed(5)}`,
      );
      marker.addTo(layer);

      map.setView(
        [selectedPosition.latitude, selectedPosition.longitude],
        Math.max(map.getZoom(), 14),
      );
    }
  }, [issues, selectedPosition]);

  return (
    <div className="relative overflow-hidden border border-border bg-muted" style={{ height }}>
      <div ref={containerRef} className="h-full w-full" />
      <div className="pointer-events-none absolute left-3 top-3 z-[400] border border-border bg-card/95 px-2 py-1.5 text-[10px] font-semibold shadow-sm">
        CivicPulse Demo Data • Kopargaon • Shrirampur • Shirdi
      </div>
    </div>
  );
}
