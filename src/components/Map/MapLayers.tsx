import React, { useEffect, useState } from 'react';
import { GeoJSON, useMap } from 'react-leaflet';
import L, { type PathOptions } from 'leaflet';
import { useApp } from '../../context/AppContext';
import { Config } from '../../utils/constants';

export function MapLayers() {
  const { state } = useApp();
  const map = useMap();
  const [zoneUpdateKey, setZoneUpdateKey] = useState(0);

  // Force re-render when zones change
  useEffect(() => {
    setZoneUpdateKey(prev => prev + 1);
  }, [state.data.bufferZones, state.data.eligibleZones]);

  // Clear all layers when data is cleared
  useEffect(() => {
    if (!state.data.restrictedLocations && !state.data.bufferZones && !state.data.eligibleZones) {
      map.eachLayer((layer) => {
        if ('feature' in layer) {
          map.removeLayer(layer);
        }
      });
    }
  }, [state.data, map]);

  return (
    <>
      {/* Sensitive Locations (Blue markers) */}
      {state.data.geoJSON && (
        <GeoJSON
          key="sensitive-locations"
          data={state.data.geoJSON}
          pointToLayer={(feature, latlng) => {
            return L.circleMarker(latlng, {
              radius: Config.styles.sensitiveLocation.radius,
              fillColor: Config.styles.sensitiveLocation.fillColor,
              color: Config.styles.sensitiveLocation.color,
              weight: 1,
              opacity: 1,
              fillOpacity: Config.styles.sensitiveLocation.fillOpacity
            });
          }}
          style={Config.styles.sensitiveLocation as PathOptions}
        />
      )}

      {/* Restricted Zones (Red areas) */}
      {state.data.bufferZones && (
        <GeoJSON
          key={`restricted-zones-${zoneUpdateKey}`}
          data={state.data.bufferZones}
          style={Config.styles.restrictedZone as PathOptions}
        />
      )}

      {/* Eligible Zones (Green areas) */}
      {state.data.eligibleZones && (
        <GeoJSON
          key={`eligible-zones-${zoneUpdateKey}`}
          data={state.data.eligibleZones}
          style={Config.styles.eligibleZone as PathOptions}
        />
      )}
    </>
  );
}