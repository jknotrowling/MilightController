#include <FUT02xPacketFormatter.h>

#pragma once

enum class YellowPopCommand {
  ON = 0x02,
  OFF = 0x05,
  BRIGHTNESS_LOW = 0x01,
  BRIGHTNESS_MID = 0x04,
  BRIGHTNESS_HIGH = 0x03,
  BRIGHTNESS = 0x00
};

class YellowPopPacketFormatter : public FUT02xPacketFormatter {
public:
  YellowPopPacketFormatter()
    : FUT02xPacketFormatter(REMOTE_TYPE_YELLOW_POP)
  { }

  virtual void updateStatus(MiLightStatus status, uint8_t groupId);
  virtual void updateBrightness(uint8_t value);

  virtual BulbId parsePacket(const uint8_t* packet, JsonObject result) override;
};
