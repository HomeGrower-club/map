import { useEffect, useState } from 'react';
import { GeoJSON, useMap } from 'react-leaflet';
import L, { type PathOptions } from 'leaflet';
import { useApp } from '../../context/AppContext';
import { Config } from '../../utils/constants';
import * as m from '../../paraglide/messages';

// Helper function to get localized location type names
function getLocationTypeName(type: string): string {
  switch (type) {
    case 'school':
      return m.location_type_school();
    case 'kindergarten':
      return m.location_type_kindergarten();
    case 'playground':
      return m.location_type_playground();
    case 'community_centre':
      return m.location_type_community_centre();
    case 'sports_centre':
      return m.location_type_sports_centre();
    case 'fitness_centre':
      return m.location_type_fitness_centre();
    default:
      return type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');
  }
}

export function MapLayers() {
  const { state } = useApp();
  const map = useMap();
  const [zoneUpdateKey, setZoneUpdateKey] = useState(0);

  // Create custom pane for location markers with higher z-index
  useEffect(() => {
    if (!map.getPane('locationMarkers')) {
      const pane = map.createPane('locationMarkers');
      pane.style.zIndex = '650'; // Higher than overlayPane (400) but lower than shadowPane (500)
    }
  }, [map]);

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
      {/* Restricted Zones (Red areas) - Render first so they appear below */}
      {state.data.bufferZones && (
        <GeoJSON
          key={`restricted-zones-${zoneUpdateKey}`}
          data={state.data.bufferZones}
          style={Config.styles.restrictedZone as PathOptions}
        />
      )}

      {/* Eligible Zones (Green areas) - Render second */}
      {state.data.eligibleZones && (
        <GeoJSON
          key={`eligible-zones-${zoneUpdateKey}`}
          data={state.data.eligibleZones}
          style={Config.styles.eligibleZone as PathOptions}
        />
      )}

      {/* Sensitive Locations (Blue markers) - Render last so they appear on top and remain clickable */}
      {state.data.geoJSON && (
        <GeoJSON
          key="sensitive-locations"
          data={state.data.geoJSON}
          pointToLayer={(_feature, latlng) => {
            // Create the circle marker with custom pane for proper layering
            const marker = L.circleMarker(latlng, {
              radius: Config.styles.sensitiveLocation.radius,
              fillColor: Config.styles.sensitiveLocation.fillColor,
              color: Config.styles.sensitiveLocation.color,
              weight: 1,
              opacity: 1,
              fillOpacity: Config.styles.sensitiveLocation.fillOpacity,
              pane: 'locationMarkers', // Use custom pane with higher z-index
              interactive: true // Explicitly enable interactivity
            });
            
            return marker;
          }}
          onEachFeature={(feature, layer) => {
            // Create popup content with location information
            const properties = feature.properties;
            const name = properties.name || m.location_popup_unnamed();
            const type = properties.amenity || properties.leisure || 'unknown';
            
            // Build popup content with available information
            let popupContent = `
              <div style="min-width: 200px;">
                <h3 style="margin: 0 0 8px 0; font-weight: bold; font-size: 14px;">${name}</h3>
                <div style="font-size: 12px; line-height: 1.5;">
                  <div><strong>${m.location_popup_type()}:</strong> ${getLocationTypeName(type)}</div>
                  <div><strong>${m.location_popup_osm_id()}:</strong> ${properties.osm_id}</div>
            `;

            // Add additional properties if available
            if (properties.tags) {
              const tags = properties.tags;
              
              if (tags['addr:street'] || tags['addr:housenumber']) {
                const address = [
                  tags['addr:housenumber'],
                  tags['addr:street'],
                  tags['addr:postcode'],
                  tags['addr:city']
                ].filter(Boolean).join(' ');
                if (address) {
                  popupContent += `<div><strong>${m.location_popup_address()}:</strong> ${address}</div>`;
                }
              }
              
              if (tags.operator) {
                popupContent += `<div><strong>${m.location_popup_operator()}:</strong> ${tags.operator}</div>`;
              }
              
              if (tags.website) {
                popupContent += `<div><strong>${m.location_popup_website()}:</strong> <a href="${tags.website}" target="_blank" rel="noopener noreferrer">${tags.website}</a></div>`;
              }
              
              if (tags.opening_hours) {
                popupContent += `<div><strong>${m.location_popup_opening_hours()}:</strong> ${tags.opening_hours}</div>`;
              }
              
              if (tags.phone) {
                popupContent += `<div><strong>${m.location_popup_phone()}:</strong> ${tags.phone}</div>`;
              }
              
              if (tags.email) {
                popupContent += `<div><strong>${m.location_popup_email()}:</strong> ${tags.email}</div>`;
              }
              
              if (tags.capacity) {
                popupContent += `<div><strong>${m.location_popup_capacity()}:</strong> ${tags.capacity}</div>`;
              }
              
              if (tags.wheelchair) {
                const wheelchairAccess = tags.wheelchair === 'yes' ? m.location_popup_yes() :
                                       tags.wheelchair === 'no' ? m.location_popup_no() :
                                       tags.wheelchair === 'limited' ? m.location_popup_limited() :
                                       tags.wheelchair;
                popupContent += `<div><strong>${m.location_popup_wheelchair()}:</strong> ${wheelchairAccess}</div>`;
              }
            }

            popupContent += `
                </div>
              </div>
            `;

            // Bind popup to the layer (proper way for GeoJSON)
            layer.bindPopup(popupContent, {
              maxWidth: 300,
              minWidth: 200,
              className: 'location-popup'
            });
          }}
          style={Config.styles.sensitiveLocation as PathOptions}
        />
      )}
    </>
  );
}