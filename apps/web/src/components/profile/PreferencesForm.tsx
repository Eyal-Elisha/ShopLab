import { useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function PreferencesForm() {
  const { theme, setTheme } = useTheme();
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();

  const handleThemeChange = async (newTheme: "light" | "dark") => {
    if (newTheme === theme) return;
    
    setIsUpdating(true);
    try {
      await setTheme(newTheme);
      toast({
        title: "Preferences updated",
        description: `Theme changed to ${newTheme}.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update preferences.",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <div className="mb-4">
        <h2 className="font-display text-xl font-semibold text-foreground">Storefront Preferences</h2>
        <p className="text-sm text-muted-foreground">Customize your ShopLab experience.</p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Appearance</p>
            <p className="text-xs text-muted-foreground">Switch between light and dark themes.</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={theme === "light" ? "default" : "outline"}
              size="sm"
              onClick={() => handleThemeChange("light")}
              disabled={isUpdating}
            >
              <Sun className="mr-2 h-4 w-4" />
              Light
            </Button>
            <Button
              variant={theme === "dark" ? "default" : "outline"}
              size="sm"
              onClick={() => handleThemeChange("dark")}
              disabled={isUpdating}
            >
              <Moon className="mr-2 h-4 w-4" />
              Dark
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
