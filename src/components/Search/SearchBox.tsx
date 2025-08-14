import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { duckdbSpatial } from '../../services/duckdbSpatial';
import { geocodingService, type GeocodingResult } from '../../services/geocodingService';
import { Logger } from '../../utils/logger';
import * as m from '../../paraglide/messages.js';

interface LocalSearchResult {
  id: number;
  osm_id: number;
  name: string;
  type: string;
  lat: number;
  lon: number;
  tags: Record<string, string>;
  source: 'local';
}

interface GeocodedSearchResult extends Omit<GeocodingResult, 'lat' | 'lon'> {
  lat: number;
  lon: number;
  source: 'geocoded';
}

type SearchResult = LocalSearchResult | GeocodedSearchResult;

export function SearchBox() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const map = useMap();
  // const { state } = useApp(); // Unused for now

  // Search with debounce
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    try {
      // Perform both searches in parallel
      const [localResults, geocodingResults] = await Promise.all([
        // Search local database for restricted locations
        duckdbSpatial.searchLocations(searchQuery).catch(err => {
          Logger.error('Local search error:', err);
          return [];
        }),
        // Search OpenStreetMap for addresses and places
        geocodingService.searchAddress(searchQuery, { limit: 10, bounded: true }).catch(err => {
          Logger.error('Geocoding search error:', err);
          return [];
        })
      ]);

      // Combine results, marking their source
      const combinedResults: SearchResult[] = [
        // Local results first (these are restricted locations)
        ...localResults.map(r => ({ ...r, source: 'local' as const })),
        // Then geocoded results (general addresses/places)
        ...geocodingResults.map(r => ({ 
          ...r, 
          source: 'geocoded' as const,
          lat: parseFloat(r.lat),
          lon: parseFloat(r.lon)
        }))
      ];

      setResults(combinedResults);
      setShowResults(true);
      setSelectedIndex(-1);
    } catch (error) {
      Logger.error('Search failed:', error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Handle input change with debounce
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Set new timeout for search
    searchTimeoutRef.current = setTimeout(() => {
      performSearch(value);
    }, 300);
  }, [performSearch]);

  // Handle result click
  const handleResultClick = useCallback((result: SearchResult) => {
    // Close search results
    setShowResults(false);
    
    // Get the name/title for the location
    const locationName = result.source === 'local' 
      ? result.name 
      : (result as GeocodedSearchResult).display_name || (result as GeocodedSearchResult).name || 'Location';
    
    setQuery(locationName);

    // Pan and zoom to the location
    const lat = result.lat;
    const lon = result.lon;
    
    map.flyTo([lat, lon], 16, {
      duration: 1
    });

    // Create popup content based on result type
    let popupContent = '';
    if (result.source === 'local') {
      popupContent = `
        <b>${result.name}</b><br>
        <span style="color: #ff6b6b;">⚠️ Restricted Location</span><br>
        Type: ${result.type}<br>
        <small>OSM ID: ${result.osm_id}</small>
      `;
    } else {
      const geocoded = result as GeocodedSearchResult;
      const address = geocoded.address;
      popupContent = `
        <b>${geocoded.name || 'Location'}</b><br>
        ${address?.road ? `${address.house_number || ''} ${address.road}<br>` : ''}
        ${address?.suburb ? `${address.suburb}<br>` : ''}
        ${address?.postcode ? `${address.postcode} ` : ''}${address?.city || 'Berlin'}<br>
        <small>Type: ${geocoded.type || geocoded.class}</small>
      `;
    }

    // Add a temporary marker with different colors
    const markerColor = result.source === 'local' ? '#ff6b6b' : '#4CAF50';
    const markerIcon = L.divIcon({
      className: 'custom-search-marker',
      html: `<div style="background-color: ${markerColor}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });

    const marker = L.marker([lat, lon], { icon: markerIcon })
      .addTo(map)
      .bindPopup(popupContent)
      .openPopup();

    // Remove marker after 10 seconds
    setTimeout(() => {
      map.removeLayer(marker);
    }, 10000);

    // Log the action
    Logger.log(`Navigated to: ${locationName} (${lat}, ${lon})`);
  }, [map]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showResults || results.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < results.length) {
          handleResultClick(results[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowResults(false);
        setSelectedIndex(-1);
        break;
    }
  }, [showResults, results, selectedIndex, handleResultClick]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (resultsRef.current && !resultsRef.current.contains(event.target as Node) &&
          inputRef.current && !inputRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Get type display name and icon
  const getTypeDisplay = (result: SearchResult): { icon: string; text: string } => {
    if (result.source === 'local') {
      const typeMap: Record<string, { icon: string; text: string }> = {
        school: { icon: '🏫', text: `${m.location_type_school()} (${m.restricted_areas_label()})` },
        kindergarten: { icon: '👶', text: `${m.location_type_kindergarten()} (${m.restricted_areas_label()})` },
        playground: { icon: '🎮', text: `${m.location_type_playground()} (${m.restricted_areas_label()})` },
        community_centre: { icon: '🏢', text: `${m.location_type_community_centre()} (${m.restricted_areas_label()})` },
        sports_centre: { icon: '⚽', text: `${m.location_type_sports_centre()} (${m.restricted_areas_label()})` },
        fitness_centre: { icon: '💪', text: `${m.location_type_fitness_centre()} (${m.restricted_areas_label()})` },
        other: { icon: '⚠️', text: `${m.location_type_other()} (${m.restricted_areas_label()})` }
      };
      return typeMap[result.type] || { icon: '⚠️', text: `${m.location_type_other()} (${m.restricted_areas_label()})` };
    } else {
      const geocoded = result as GeocodedSearchResult;
      const classMap: Record<string, { icon: string; text: string }> = {
        amenity: { icon: '🏛️', text: 'Amenity' },
        building: { icon: '🏢', text: 'Building' },
        highway: { icon: '🛣️', text: 'Street' },
        place: { icon: '📍', text: 'Place' },
        shop: { icon: '🛍️', text: 'Shop' },
        tourism: { icon: '🎭', text: 'Tourism' },
        leisure: { icon: '🌳', text: 'Leisure' },
        office: { icon: '💼', text: 'Office' },
        railway: { icon: '🚉', text: 'Railway' },
        natural: { icon: '🌲', text: 'Natural' }
      };
      
      return classMap[geocoded.class] || { icon: '📍', text: geocoded.type || 'Location' };
    }
  };

  return (
    <div className="absolute top-2.5 sm:top-2.5 left-1/2 transform -translate-x-1/2 z-[1000] w-[95%] sm:w-[90%] max-w-sm md:max-w-md">
      <div className="relative w-full">
        <input
          ref={inputRef}
          type="text"
          placeholder={m.search_placeholder()}
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setShowResults(true)}
          className="w-full py-3 px-4 pr-10 text-sm sm:text-sm text-base border-2 border-border rounded-lg bg-background shadow-lg transition-all duration-200 outline-none focus:border-primary focus:shadow-xl placeholder:text-muted-foreground"
        />
        {isSearching && <div className="absolute right-3 top-1/2 transform -translate-y-1/2 animate-spin">🔍</div>}
      </div>

      {showResults && results.length > 0 && (
        <div ref={resultsRef} className="absolute top-full left-0 right-0 bg-background border border-border rounded-lg shadow-xl max-h-96 overflow-y-auto mt-1 z-[1001]">
          {results.map((result, index) => {
            const typeDisplay = getTypeDisplay(result);
            const displayName = result.source === 'local' 
              ? result.name 
              : (result as GeocodedSearchResult).display_name;
            
            return (
              <div
                key={`${result.source}-${result.osm_id}-${index}`}
                className={`p-2.5 px-4 cursor-pointer flex items-center gap-3 border-b border-border last:border-b-0 transition-colors duration-150 hover:bg-muted/50 ${
                  index === selectedIndex ? 'bg-muted/50' : ''
                } ${
                  result.source === 'local' ? 'bg-red-50/50 hover:bg-red-50/80' : ''
                }`}
                onClick={() => handleResultClick(result)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="text-lg flex-shrink-0" title={typeDisplay.text}>
                  {typeDisplay.icon}
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="font-medium text-foreground whitespace-nowrap overflow-hidden text-ellipsis">
                    {result.source === 'local' ? result.name : (result as GeocodedSearchResult).name || displayName?.split(',')[0]}
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis mt-0.5">
                    {result.source === 'local' ? (
                      <span className="text-red-600 font-medium text-xs">{m.restricted_zone_label()}</span>
                    ) : (
                      displayName && displayName.split(',').slice(1).join(',').trim()
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showResults && query.trim() && results.length === 0 && !isSearching && (
        <div ref={resultsRef} className="absolute top-full left-0 right-0 bg-background border border-border rounded-lg shadow-xl mt-1 z-[1001]">
          <div className="py-5 px-4 text-center text-muted-foreground italic">{m.search_no_results({ query })}</div>
        </div>
      )}
    </div>
  );
}