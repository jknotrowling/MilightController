#include <YellowPopPacketFormatter.h>
#include <Units.h>

// The remote slider lowpoint has a values of 0x90/144/-112, the midpoint 0x00, the highpoint 0x75/117
uint8_t offset = 0x80;

void YellowPopPacketFormatter::updateBrightness(uint8_t value) {
  uint8_t remapped = Units::rescale<uint8_t, uint8_t>(value, 255, 100.0);
  int8_t brightness = (int8_t)remapped - offset;
  command(static_cast<uint8_t>(YellowPopCommand::BRIGHTNESS), brightness);
}

void YellowPopPacketFormatter::updateStatus(MiLightStatus status, uint8_t groupId) {
  if (status == MiLightStatus::OFF) {
    command(static_cast<uint8_t>(YellowPopCommand::OFF), 0);
  } else if (status == MiLightStatus::ON) {
    command(static_cast<uint8_t>(YellowPopCommand::ON), 0);
  }
}

BulbId YellowPopPacketFormatter::parsePacket(const uint8_t* packet, JsonObject result) {
  YellowPopCommand command = static_cast<YellowPopCommand>(packet[FUT02xPacketFormatter::FUT02X_COMMAND_INDEX] & 0x0F);

  BulbId bulbId(
    (packet[1] << 8) | packet[2],
    0,
    REMOTE_TYPE_YELLOW_POP
  );

  switch (command) {
    case YellowPopCommand::ON:
      result[F("state")] = F("ON");
      break;

    case YellowPopCommand::OFF:
      result[F("state")] = F("OFF");
      break;

    case YellowPopCommand::BRIGHTNESS_LOW:
      result[F("command")] = F("brightness_low");
      break;

    case YellowPopCommand::BRIGHTNESS_MID:
      result[F("command")] = F("brightness_mid");
      break;

    case YellowPopCommand::BRIGHTNESS_HIGH:
      result[F("command")] = F("brightness_high");
      break;

    case YellowPopCommand::BRIGHTNESS:
      int8_t value = packet[FUT02xPacketFormatter::FUT02X_ARGUMENT_INDEX];
      result[GroupStateFieldNames::BRIGHTNESS] = value + offset;
      break;
  }

  return bulbId;
}
