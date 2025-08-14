
import * as m from '../../paraglide/messages.js';

export function MapLegend() {
  return (
    <div className="legend">
      <h4 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>{m.legend_title()}</h4>
      <div className="legend-item">
        <div 
          className="legend-color" 
          style={{ background: 'rgba(255, 0, 0, 0.3)' }}
        />
        <span>{m.restricted_areas_label()}</span>
      </div>
      <div className="legend-item">
        <div 
          className="legend-color" 
          style={{ background: 'rgba(0, 255, 0, 0.3)' }}
        />
        <span>{m.legend_eligible_areas()}</span>
      </div>
      <div className="legend-item">
        <div 
          className="legend-color" 
          style={{ background: '#3388ff' }}
        />
        <span>{m.legend_sensitive_locations()}</span>
      </div>
    </div>
  );
}