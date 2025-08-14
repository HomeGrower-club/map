import { BufferControl } from './BufferControl';
import { ModeSelector } from './ModeSelector';
import { ActionButtons } from './ActionButtons';
import { StatusDisplay } from '../Status/StatusDisplay';
import { LoadingSpinner } from '../Status/ProgressBar';
import { Statistics } from '../Status/Statistics';
import { UserInfoSection } from './UserInfoSection';
import { DEBUG_MODE } from '../../utils/debugMode';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { ScrollArea } from '../ui/scroll-area';
import { Separator } from '../ui/separator';

export function ControlPanel() {
  if (DEBUG_MODE) {
    return (
      <Card className="absolute top-4 right-4 w-[380px] max-h-[90vh] bg-card/95 backdrop-blur-sm z-[1000]">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold flex items-center justify-between">
            Berlin Cannabis Club Map
            <span className="text-xs text-muted-foreground font-normal">[Debug Mode]</span>
          </CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <ScrollArea className="max-h-[70vh] pr-4">
            <Tabs defaultValue="user" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="user">User</TabsTrigger>
                <TabsTrigger value="debug">Debug</TabsTrigger>
              </TabsList>
              
              <TabsContent value="user" className="space-y-4 mt-4">
                <UserInfoSection />
                <ActionButtons />
                <StatusDisplay />
                <LoadingSpinner />
                <Statistics />
              </TabsContent>
              
              <TabsContent value="debug" className="space-y-4 mt-4">
                <div className="text-sm font-medium text-muted-foreground mb-4">
                  🔧 Debug Controls
                </div>
                <BufferControl />
                <ModeSelector />
                <Separator />
                <StatusDisplay />
                <LoadingSpinner />
                <Statistics />
              </TabsContent>
            </Tabs>
          </ScrollArea>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="absolute top-4 right-4 w-[380px] max-h-[90vh] bg-card/95 backdrop-blur-sm z-[1000]">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-semibold">
          Berlin Cannabis Club Map
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <ScrollArea className="max-h-[70vh] pr-4">
          <div className="">
            <UserInfoSection />
            <ActionButtons />
            <StatusDisplay />
            <LoadingSpinner />
            <Statistics />
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}