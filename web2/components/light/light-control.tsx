import React, { useRef, useEffect } from "react";
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
  id?: z.infer<typeof schemas.BulbId>;
}

export function LightControl({
  state,
  capabilities,
  updateState,
  deviceType,
  onGroupChange,
  currentGroupId,
  id,
}: LightControlProps) {
  const handleBrightnessChange = (value: number[]) => {
    updateState({ level: value[0] });
  };

  const handleColorTempChange = (value: number[]) => {
    updateState({ kelvin: value[0] });
    updateState({ color_mode: schemas.ColorMode.Values.color_temp });
  };

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

  const handleColorChange = (color: {
    hsva: { h: number; s: number; v: number; a: number };
  }) => {
    if (!isInteracting.current) return;
    const rgba = hsvaToRgba(color.hsva);
    updateState({
      color: { r: rgba.r, g: rgba.g, b: rgba.b },
    });
    updateState({ color_mode: schemas.ColorMode.Values.rgb });
  };

  const [hsb, setHsb] = React.useState({ h: 0, s: 0, v: 0 });

  useEffect(() => {
    if (state.color) {
      const hsva = rgbaToHsva({ ...state.color, a: 1 });
      setHsb({ h: hsva.h, s: hsva.s, v: hsva.v });
    }
  }, [state.color]);

  const handleHsbChange = (channel: "h" | "s" | "v", value: number) => {
    if (isNaN(value)) value = 0;
    let clampedValue = value;
    if (channel === "h") clampedValue = Math.max(0, Math.min(360, value));
    else clampedValue = Math.max(0, Math.min(100, value));

    setHsb(prev => ({ ...prev, [channel]: clampedValue }));
  };

  const handleSetColor = () => {
    const rgba = hsvaToRgba({ ...hsb, a: 1 });
    updateState({
      color: { r: rgba.r, g: rgba.g, b: rgba.b },
    });
    updateState({ color_mode: schemas.ColorMode.Values.rgb });
  };

  const handleSaveDefault = async () => {
    if (!id) return;
    const rgba = hsvaToRgba({ ...hsb, a: 1 });
    try {
      await api.saveDefaultColor({ color: { r: rgba.r, g: rgba.g, b: rgba.b } }, {
        params: {
          deviceId: id.device_id,
          remoteType: id.device_type,
          groupId: id.group_id
        }
      });
    } catch (e) {
      console.error(e);
    }
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
                <div className="flex space-x-2 mt-4">
                  <div className="flex flex-col items-center">
                    <Label htmlFor="h" className="mb-1 text-xs">
                      H
                    </Label>
                    <Input
                      id="h"
                      type="number"
                      min={0}
                      max={360}
                      className="w-16 text-center"
                      value={hsb.h}
                      onChange={(e) =>
                        handleHsbChange("h", parseInt(e.target.value))
                      }
                    />
                  </div>
                  <div className="flex flex-col items-center">
                    <Label htmlFor="s" className="mb-1 text-xs">
                      S
                    </Label>
                    <Input
                      id="s"
                      type="number"
                      min={0}
                      max={100}
                      className="w-16 text-center"
                      value={hsb.s}
                      onChange={(e) =>
                        handleHsbChange("s", parseInt(e.target.value))
                      }
                    />
                  </div>
                  <div className="flex flex-col items-center">
                    <Label htmlFor="v" className="mb-1 text-xs">
                      B
                    </Label>
                    <Input
                      id="v"
                      type="number"
                      min={0}
                      max={100}
                      className="w-16 text-center"
                      value={hsb.v}
                      onChange={(e) =>
                        handleHsbChange("v", parseInt(e.target.value))
                      }
                    />
                  </div>
                </div>
                <div className="flex space-x-2 mt-4">
                  <Button size="sm" onClick={handleSetColor}>Set</Button>
                  {id && <Button size="sm" variant="outline" onClick={handleSaveDefault}>Save Default</Button>}
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