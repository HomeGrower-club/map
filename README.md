# Cannabis Club Map - Berlin

A high-performance web application for mapping cannabis club eligible zones in Berlin, Germany. This tool calculates and visualizes areas where cannabis clubs can legally operate based on distance restrictions from sensitive locations like schools, kindergartens, and playgrounds.

![Cannabis Club Map Screenshot](https://via.placeholder.com/800x400?text=Cannabis+Club+Map+Screenshot)

## 🚀 Features

- **Interactive Map**: Real-time exploration of Berlin with Leaflet-based mapping
- **High-Performance Spatial Processing**: Uses DuckDB WASM for lightning-fast geometry calculations
- **Buffer Zone Visualization**: Dynamic calculation of restricted and eligible zones
- **Location Search**: Find specific addresses and points of interest
- **Multi-Language Support**: Available in English and German
- **Responsive Design**: Works on desktop and mobile devices
- **Offline-First Data**: Pre-processed OpenStreetMap data for instant loading

## 🛠️ Technology Stack

- **Frontend**: React 19 + TypeScript + Vite 7
- **Styling**: Tailwind CSS 4 with shadcn/ui components
- **Mapping**: Leaflet with react-leaflet
- **Spatial Processing**: DuckDB WASM with spatial extension
- **Data Storage**: Apache Parquet for optimized data handling
- **Internationalization**: Paraglide for i18n
- **UI Components**: Radix UI primitives

## 🏃‍♂️ Quick Start

### Prerequisites

- Node.js 18+ 
- Yarn package manager

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd club-map

# Install dependencies
yarn install

# Start development server
yarn dev
```

The application will be available at `http://localhost:5173`

### Development Commands

```bash
# Development server with hot reload
yarn dev

# Build for production (includes data generation)
yarn build

# Build without regenerating data (faster for code-only changes)
yarn build:only

# Generate fresh data from OpenStreetMap
yarn generate-parquet

# Use cached data for development (much faster)
yarn generate-parquet:cached

# Lint code
yarn lint

# Preview production build
yarn preview
```

## 📊 How It Works

### Data Processing Pipeline

1. **Data Acquisition**: The build process fetches current data from OpenStreetMap's Overpass API for Berlin, targeting:
   - Schools (`amenity=school`)
   - Kindergartens (`amenity=kindergarten`) 
   - Playgrounds (`leisure=playground`)
   - Community centres (`amenity=community_centre`)
   - Sports centres (`leisure=sports_centre`)

2. **Data Optimization**: Raw OSM data is processed and stored in Apache Parquet format with:
   - Spatial indexes (R-tree) for fast geometry queries
   - Grid-based partitioning for efficient filtering
   - Pre-computed bounding boxes and simplified geometries
   - Optimized data types and compression

3. **Runtime Processing**: The web application loads the Parquet data into DuckDB WASM and:
   - Creates buffer zones around sensitive locations
   - Calculates eligible areas (map viewport minus restricted zones)
   - Provides real-time spatial queries and search functionality

### Performance Optimizations

- **Multi-level Spatial Indexing**: Grid cells + bounding boxes + R-tree indexes
- **Geometry Simplification**: Different levels of detail based on processing mode
- **Batch Operations**: Optimized SQL queries combining multiple operations
- **Memory Management**: Efficient WASM memory usage and cleanup
- **Caching Strategy**: Browser storage for user preferences and search history

## 🎯 User Interface

### Main Controls

- **Buffer Distance Slider**: Adjust the distance restriction (50m - 500m)
- **Processing Mode**: Choose between Fast, Balanced, and Precise calculations
- **Action Buttons**: Load data, calculate zones, clear results
- **Search Box**: Find locations by name or address

### Map Features

- **Base Layers**: Choose between different map styles
- **Zone Visualization**: 
  - Red areas: Restricted zones (within buffer distance of sensitive locations)
  - Green areas: Eligible zones (where cannabis clubs can operate)
- **Location Markers**: Sensitive locations with detailed information
- **Legend**: Statistics and color coding explanation

### Languages

The application supports:
- 🇬🇧 English (default)
- 🇩🇪 German (Deutsch)

Language is automatically detected from browser settings or can be manually selected.

## 🏗️ Architecture

### Frontend Architecture

```
src/
├── components/           # UI components
│   ├── Controls/        # User interface controls
│   ├── Map/            # Map-related components
│   ├── Legend/         # Legend and statistics
│   └── ui/             # Reusable shadcn/ui components
├── context/            # React context for state management
├── hooks/              # Custom React hooks
├── services/           # Core business logic
│   ├── duckdbSpatial.ts    # DuckDB WASM service
│   ├── overpassApi.ts      # OSM API integration
│   └── geocodingService.ts # Location search
├── types/              # TypeScript type definitions
└── utils/              # Utility functions
```

### State Management

The application uses React Context with useReducer for state management, handling:

- **Map State**: Current bounds, zoom level, center
- **Data State**: Loaded locations, calculated zones, search results  
- **Processing State**: Loading status, progress, processing mode
- **UI State**: Status messages, statistics, user preferences

### Spatial Processing

DuckDB WASM provides the core spatial processing capabilities:

- **Initialization**: Loads spatial extension and creates optimized schemas
- **Data Loading**: Imports Parquet data with spatial indexes
- **Query Processing**: Executes complex spatial queries in-browser
- **Memory Management**: Handles WASM memory allocation and cleanup

## 🧪 Development

### Project Structure

Key files and directories:

- `src/services/duckdbSpatial.ts` - Core spatial processing engine
- `scripts/generate-parquet.js` - Build-time data processing script
- `src/context/AppContext.tsx` - Application state management
- `components.json` - shadcn/ui component configuration
- `project.inlang/` - Internationalization configuration

### Adding New Features

1. **New Spatial Calculations**: Extend the DuckDB service in `duckdbSpatial.ts`
2. **UI Components**: Follow shadcn/ui patterns in `src/components/ui/`  
3. **Map Layers**: Add new layers in `MapLayers.tsx`
4. **Translations**: Update message files in `messages/en.json` and `messages/de.json`

### Performance Considerations

- **Spatial Queries**: Use the optimized query patterns in `duckdbSpatial.ts`
- **Component Updates**: Minimize re-renders with proper React optimization
- **Memory Usage**: Dispose of DuckDB connections when components unmount
- **Bundle Size**: Import only needed parts of large libraries

## 📦 Build and Deployment

### Production Build

```bash
# Full build with fresh data
yarn build

# Quick build with existing data
yarn build:only
```

The build process:
1. Generates fresh OpenStreetMap data (if needed)
2. Processes data into optimized Parquet format
3. Builds the React application
4. Optimizes assets for production

### Deployment Requirements

- Static file hosting (Netlify, Vercel, GitHub Pages, etc.)
- No server-side requirements
- Ensure `public/berlin-locations.parquet` is included in deployment

### Environment Variables

No environment variables are required for basic functionality. All processing happens client-side.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

### Development Guidelines

1. Follow the existing TypeScript and React patterns
2. Use the established Tailwind CSS design system  
3. Add appropriate error handling for spatial operations
4. Include proper loading states for async operations
5. Consider internationalization for user-facing strings
6. Test with different processing modes and buffer distances

### Code Style

- TypeScript strict mode enabled
- ESLint configuration for React and TypeScript
- Prettier formatting (if configured)
- Consistent naming conventions

## 📄 License

[Specify your license here]

## 🙏 Acknowledgments

- **OpenStreetMap**: For providing open geospatial data
- **DuckDB**: For the powerful WASM-based spatial processing engine
- **Leaflet**: For the excellent mapping library
- **shadcn/ui**: For the beautiful and accessible UI components
- **Paraglide**: For the type-safe internationalization framework

## 📞 Support

For questions, issues, or contributions, please [open an issue](link-to-issues) or contact [your-contact-info].

---

**Note**: This application is for informational purposes only. Always consult local regulations and legal authorities for official guidance on cannabis club regulations in Berlin.