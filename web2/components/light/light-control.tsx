import React, { useRef, useEffect, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Wheel from "@uiw/react-color-wheel";
import { hsvaToRgba, rgbaToHsva } from "@uiw/color-convert";
import { Sun, Moon, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { RemoteTypeCapabilities } from "./remote-data";
import { z } from "zod";
import { schemas } from "@/api/api-zod";
import { getGroupCountForRemoteType } from "@/lib/utils";
import { api } from "@/lib/api";

interface LightControlProps {
  state: z.infer<typeof schemas.NormalizedGroupState>;
  capabilities: typeof RemoteTypeCapabilities[keyof typeof RemoteTypeCapabilities];
  updateState: (payload: Partial<z.infer<typeof schemas.NormalizedGroupState>>) => void;
  deviceType?: z.infer<typeof schemas.RemoteType>;
  onGroupChange?: (groupId: number) => void;
  currentGroupId?: number;
  bulbId?: z.infer<typeof schemas.BulbId>;
}

export function LightControl({
  state,
  capabilities,
  updateState,
  deviceType,
  onGroupChange,
  currentGroupId,
  bulbId,
}: LightControlProps) {
  const [settings, setSettings] = useState<z.infer<typeof schemas.Settings> | null>(null);

  // Local state for RGB inputs
  const [localColor, setLocalColor] = useState({ r: 0, g: 0, b: 0 });

  useEffect(() => {
    api.getSettings().then(setSettings);
  }, []);

  const isInteracting = useRef(false);

  useEffect(() => {
    const handleUp = () => {
      isInteracting.current = false;
    };
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("touchend", handleUp);
    return () => {
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("touchend", handleUp);
    };
  }, []);

  // Sync local color with state color when not interacting
  useEffect(() => {
    if (!isInteracting.current && state.color) {
      setLocalColor({
        r: state.color.r || 0,
        g: state.color.g || 0,
        b: state.color.b || 0,
      });
    }
  }, [state.color]);

  const handleBrightnessChange = (value: number[]) => {
    updateState({ level: value[0] });
  };

  const handleColorTempChange = (value: number[]) => {
    updateState({ kelvin: value[0] });
    updateState({ color_mode: schemas.ColorMode.Values.color_temp });
  };

  const handleColorChange = (color: {
    hsva: { h: number; s: number; v: number; a: number };
  }) => {
    if (!isInteracting.current) return;
    const rgba = hsvaToRgba(color.hsva);
    const newColor = { r: rgba.r, g: rgba.g, b: rgba.b };
    setLocalColor(newColor); // Update local inputs
    updateState({
      color: newColor,
    });
    updateState({ color_mode: schemas.ColorMode.Values.rgb });
  };

  const handleRgbInputChange = (channel: "r" | "g" | "b", value: number) => {
    if (isNaN(value)) value = 0;
    const clampedValue = Math.max(0, Math.min(255, value));
    setLocalColor((prev) => ({ ...prev, [channel]: clampedValue }));
  };

  const handleRgbSubmit = () => {
    updateState({
      color: localColor,
    });
    updateState({ color_mode: schemas.ColorMode.Values.rgb });
  };

  const saveDefaultColor = async () => {
    if (!bulbId || !state.color || !settings) return;
    const key = `${bulbId.device_type}:${bulbId.device_id}:${bulbId.group_id}`;
    const packedColor = (state.color.r << 16) | (state.color.g << 8) | state.color.b;

    const newGroupDefaultColors = {
        ...settings.group_default_colors,
        [key]: packedColor
    };

    setSettings({ ...settings, group_default_colors: newGroupDefaultColors });

    await api.putSettings({ group_default_colors: newGroupDefaultColors });
  };

  const setToDefaultColor = () => {
     if (!bulbId || !settings?.group_default_colors) return;
     const key = `${bulbId.device_type}:${bulbId.device_id}:${bulbId.group_id}`;
     const packedColor = settings.group_default_colors[key];
     if (packedColor !== undefined) {
        const r = (packedColor >> 16) & 0xFF;
        const g = (packedColor >> 8) & 0xFF;
        const b = packedColor & 0xFF;
        updateState({ color: { r, g, b } });
        updateState({ color_mode: schemas.ColorMode.Values.rgb });
     }
  };

  const getDefaultColorText = () => {
      if (!bulbId || !settings?.group_default_colors) return "None";
      const key = `${bulbId.device_type}:${bulbId.device_id}:${bulbId.group_id}`;
      const packedColor = settings.group_default_colors[key];
      if (packedColor === undefined) return "None";
      const r = (packedColor >> 16) & 0xFF;
      const g = (packedColor >> 8) & 0xFF;
      const b = packedColor & 0xFF;
      return `RGB(${r}, ${g}, ${b})`;
  };

  const sendCommand = (command: z.infer<typeof schemas.GroupStateCommand>) => {
    updateState({ command: command });
  };

  const convertedColor = rgbaToHsva(
    state.color ? { ...state.color, a: 1 } : { r: 255, g: 255, b: 255, a: 1 }
  );

  const handleModeChange = (value: z.infer<typeof schemas.ColorMode>) => {
    updateState({ color_mode: value });
    if (value === schemas.ColorMode.Values.color_temp) {
      sendCommand(schemas.GroupStateCommand.Values.set_white);
    } else if (value === schemas.ColorMode.Values.rgb) {
      updateState({
        color: {
          r: state.color?.r || 255,
          g: state.color?.g || 0,
          b: state.color?.b || 255,
        },
      });
    } else if (value === schemas.ColorMode.Values.onoff) {
      sendCommand(schemas.GroupStateCommand.Values.night_mode);
    }
  };

  const handleModeIncrement = () => {
    updateState({ command: schemas.GroupStateCommand.Values.next_mode });
  };

  const handleModeDecrement = () => {
    updateState({ command: schemas.GroupStateCommand.Values.previous_mode });
  };

  const handleSpeedIncrement = () => {
    updateState({ command: schemas.GroupStateCommand.Values.mode_speed_up });
  };

  const handleSpeedDecrement = () => {
    updateState({ command: schemas.GroupStateCommand.Values.mode_speed_down });
  };

  const groupCount = deviceType ? getGroupCountForRemoteType(deviceType) : 4;

  return (
    <div className="flex flex-col items-center justify-center space-y-4 h-full">
      {onGroupChange && (
        <div className="w-full">
          <label className="text-sm font-medium">Group</label>
          <ToggleGroup
            type="single"
            variant="outline"
            value={currentGroupId?.toString()}
            onValueChange={(value) => onGroupChange(parseInt(value, 10))}
            className="justify-start mt-2"
          >
            {Array.from({ length: groupCount }, (_, i) => (
              <ToggleGroupItem key={i} value={(i + 1).toString()}>
                {i + 1}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}
      {state.state === "ON" ? (
        <>
          {capabilities.color && (
            <div className="w-full">
              <div className="flex items-center">
                <label className="text-sm font-medium ml-2">Color</label>
              </div>
              <div className="mt-2 flex flex-col items-center">
                <div
                  onPointerDownCapture={() => {
                    isInteracting.current = true;
                  }}
                  onTouchStartCapture={() => {
                    isInteracting.current = true;
                  }}
                >
                  <Wheel
                    width={150}
                    height={150}
                    color={convertedColor}
                    onChange={handleColorChange}
                  />
                </div>

                <div className="flex space-x-2 mt-4 items-end">
                  <div className="flex flex-col items-center">
                    <Label htmlFor="r" className="mb-1 text-xs">
                      R
                    </Label>
                    <Input
                      id="r"
                      type="number"
                      min={0}
                      max={255}
                      className="w-16 text-center"
                      value={localColor.r}
                      onChange={(e) =>
                        handleRgbInputChange("r", parseInt(e.target.value))
                      }
                    />
                  </div>
                  <div className="flex flex-col items-center">
                    <Label htmlFor="g" className="mb-1 text-xs">
                      G
                    </Label>
                    <Input
                      id="g"
                      type="number"
                      min={0}
                      max={255}
                      className="w-16 text-center"
                      value={localColor.g}
                      onChange={(e) =>
                        handleRgbInputChange("g", parseInt(e.target.value))
                      }
                    />
                  </div>
                  <div className="flex flex-col items-center">
                    <Label htmlFor="b" className="mb-1 text-xs">
                      B
                    </Label>
                    <Input
                      id="b"
                      type="number"
                      min={0}
                      max={255}
                      className="w-16 text-center"
                      value={localColor.b}
                      onChange={(e) =>
                        handleRgbInputChange("b", parseInt(e.target.value))
                      }
                    />
                  </div>
                   <Button size="sm" onClick={handleRgbSubmit}>Set</Button>
                </div>

                <div className="flex flex-col items-center mt-4 w-full">
                    <div className="text-sm text-muted-foreground mb-2">
                        Default: {getDefaultColorText()}
                    </div>
                    <div className="flex space-x-2">
                        <Button size="sm" variant="outline" onClick={saveDefaultColor}>Save as Default</Button>
                        <Button size="sm" variant="outline" onClick={setToDefaultColor}>Set to Default</Button>
                    </div>
                </div>

              </div>
            </div>
          )}
          {capabilities.brightness && (
            <div className="w-full">
              <label className="text-sm font-medium">Brightness</label>
              <Slider
                value={[state.level || 0]}
                max={100}
                step={1}
                className="mt-2"
                onValueChange={handleBrightnessChange}
              />
            </div>
          )}
          {capabilities.colorTemp && (
            <div className="w-full">
              <label className="text-sm font-medium">Color Temperature</label>
              <Slider
                value={[state.kelvin || 0]}
                max={100}
                step={1}
                className="mt-2 py-2"
                onValueChange={handleColorTempChange}
                gradient="linear-gradient(to right, lightblue, white, orange)"
              />
            </div>
          )}
          <div className="flex flex-col mt-4 w-full">
            <div className="text-sm font-medium">Mode</div>
            <ToggleGroup
              type="single"
              value={state.color_mode}
              onValueChange={handleModeChange}
              aria-label="Select light mode"
              className="justify-normal"
            >
              {capabilities.colorTemp && (
                <ToggleGroupItem value={schemas.ColorMode.Values.color_temp}>
                  <Sun size={16} className="mr-2" />
                  White
                </ToggleGroupItem>
              )}
              {capabilities.color && (
                <ToggleGroupItem value={schemas.ColorMode.Values.rgb}>
                  <Palette size={16} className="mr-2" />
                  Color
                </ToggleGroupItem>
              )}
              <ToggleGroupItem value={schemas.ColorMode.Values.onoff}>
                <Moon size={16} className="mr-2" />
                Night
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="flex flex-col mt-4 w-full">
            <div className="text-sm font-medium">Scene</div>
            <div className="flex flex-row justify-between">
              <div className="flex mt-2">
                <Button onClick={handleModeDecrement} className="rounded-r-none" size="sm" variant="ghost">-</Button>
                <div className="text-sm font-medium bg-muted px-2 flex items-center">Scene</div>
                <Button onClick={handleModeIncrement} className="rounded-l-none" size="sm" variant="ghost">+</Button>
              </div>
              <div className="flex mt-2">
                <Button onClick={handleSpeedDecrement} className="rounded-r-none" size="sm" variant="ghost">-</Button>
                <div className="text-sm font-medium bg-muted px-2 flex items-center">Speed</div>
                <Button onClick={handleSpeedIncrement} className="rounded-l-none" size="sm" variant="ghost">+</Button>
              </div>
            </div>
          </div>
          <div className="flex-grow"></div>
          <div className="flex justify-end space-x-4 mt-8 w-full">
            <Button
              size="sm"
              onClick={() => sendCommand(schemas.GroupStateCommand.Values.pair)}
            >
              Pair
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => sendCommand(schemas.GroupStateCommand.Values.unpair)}
            >
              Unpair
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center flex-grow">
          <p className="text-muted-foreground">Light is off</p>
        </div>
      )}
    </div>
  );
}