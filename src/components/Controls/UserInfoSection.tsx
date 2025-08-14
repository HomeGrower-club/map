import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Badge } from '../ui/badge';
import { School, MapPin, Users, Target, ChevronDown } from 'lucide-react';
import * as m from '../../paraglide/messages';

export function UserInfoSection() {
  const { state } = useApp();
  const [safetyExpanded, setSafetyExpanded] = useState(true);
  const [restrictedExpanded, setRestrictedExpanded] = useState(false);
  const [instructionsExpanded, setInstructionsExpanded] = useState(false);
  
  return (
    <div className="space-y-3">
      {/* Safety Requirements */}
      <div>
        <button
          onClick={() => setSafetyExpanded(!safetyExpanded)}
          className="w-full flex items-center justify-between hover:bg-muted/50 rounded-md p-1.5 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-medium text-foreground">{m.safety_requirements_title()}</span>
          </div>
          <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform duration-200 ${safetyExpanded ? 'rotate-180' : ''}`} />
        </button>
        
        {safetyExpanded && (
          <div className="pl-6 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{m.required_distance_label()}</span>
              <Badge variant="secondary" className="text-xs">
                {m.distance_from_restricted({ distance: state.processing.bufferDistance })}
              </Badge>
            </div>
          </div>
        )}
      </div>

      {/* Restricted Locations */}
      <div>
        <button
          onClick={() => setRestrictedExpanded(!restrictedExpanded)}
          className="w-full flex items-center justify-between hover:bg-muted/50 rounded-md p-1.5 transition-colors"
        >
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-red-600" />
            <span className="text-sm font-medium text-foreground">{m.restricted_areas_title()}</span>
          </div>
          <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform duration-200 ${restrictedExpanded ? 'rotate-180' : ''}`} />
        </button>
        
        {restrictedExpanded && (
          <div className="pl-6 pt-2 space-y-2">
            <p className="text-xs text-muted-foreground">
              {m.clubs_must_keep_distance()}
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="flex items-center gap-1.5 text-xs">
                <School className="w-3 h-3 text-blue-600" />
                <span>{m.location_type_schools()}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <Target className="w-3 h-3 text-green-600" />
                <span>{m.location_type_playgrounds()}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <Users className="w-3 h-3 text-purple-600" />
                <span>{m.location_type_community_centers()}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <Target className="w-3 h-3 text-orange-600" />
                <span>{m.location_type_sports_centers()}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div>
        <button
          onClick={() => setInstructionsExpanded(!instructionsExpanded)}
          className="w-full flex items-center justify-between hover:bg-muted/50 rounded-md p-1.5 transition-colors"
        >
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-green-600" />
            <span className="text-sm font-medium text-foreground">{m.how_to_use_title()}</span>
          </div>
          <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform duration-200 ${instructionsExpanded ? 'rotate-180' : ''}`} />
        </button>
        
        {instructionsExpanded && (
          <div className="pl-6 pt-2 space-y-1.5">
            <div className="flex items-start gap-2">
              <span className="text-xs text-muted-foreground font-medium">1.</span>
              <span className="text-xs">{m.instruction_step_1()}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-xs text-muted-foreground font-medium">2.</span>
              <span className="text-xs">{m.instruction_step_2()}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-xs text-muted-foreground font-medium">3.</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="default" className="bg-green-500 hover:bg-green-500 text-white text-xs">{m.instruction_step_3_green()}</Badge>
                <span className="text-xs">{m.instruction_step_3_safe()}</span>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-xs text-muted-foreground font-medium">4.</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="destructive" className="text-xs">{m.instruction_step_4_red()}</Badge>
                <span className="text-xs">{m.instruction_step_4_restricted()}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}