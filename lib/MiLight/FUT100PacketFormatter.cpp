#include <FUT100PacketFormatter.h>
#include <V2RFEncoding.h>
#include <Units.h>
#include <MiLightCommands.h>

void FUT100PacketFormatter::updateStatus(MiLightStatus status, uint8_t groupId) {
Serial.printf("FUT100 Debug: UpdateStatus Group %d, Status %d\n", groupId, status);  //DEBUG
  this->groupId = groupId;

  if (groupId <= 8) {
    // Gruppe 0-8: Nutzt Kommando 0x01
    // ON: 0-8, OFF: 9-17 (0x09 - 0x11)
    uint8_t arg = groupId + (status == OFF ? 9 : 0);
    command(0x01, arg);
  } else {
    // Gruppe 9-100: Nutzt Kommando 0x08
    // G9 ON = 0, G9 OFF = 1, G10 ON = 2...
    uint8_t arg = ((groupId - 9) * 2) + (status == ON ? 0 : 1);
    command(0x08, arg);
  }
}

void FUT100PacketFormatter::modeSpeedDown() {
  command(0x01, 0x13); // FUT100_MODE_SPEED_DOWN
}

void FUT100PacketFormatter::modeSpeedUp() {
  command(0x01, 0x12); // FUT100_MODE_SPEED_UP
}

void FUT100PacketFormatter::updateMode(uint8_t mode) {
  command(0x06, mode); // FUT100_MODE
}

void FUT100PacketFormatter::updateBrightness(uint8_t brightness) {
  command(0x05, brightness); // FUT100_BRIGHTNESS
}

void FUT100PacketFormatter::updateHue(uint16_t value) {
  uint8_t remapped = Units::rescale(value, 255, 360);
  updateColorRaw(remapped);
}

void FUT100PacketFormatter::updateColorRaw(uint8_t value) {
  command(0x02, value); // FUT100_COLOR
}

void FUT100PacketFormatter::updateTemperature(uint8_t value) {
  const GroupState* ourState = this->stateStore->get(this->deviceId, this->groupId, REMOTE_TYPE_FUT100);
  BulbMode originalBulbMode = BulbMode::BULB_MODE_WHITE;

  if (ourState != NULL) {
    originalBulbMode = ourState->getBulbMode();
    if (originalBulbMode != BulbMode::BULB_MODE_WHITE) {
      updateColorWhite();
    }
  }

  command(0x07, 100 - value); // KELVIN

  if (ourState != NULL && (settings->enableAutomaticModeSwitching) && (originalBulbMode != BulbMode::BULB_MODE_WHITE)) {
    switchMode(*ourState, originalBulbMode);
  }
}

void FUT100PacketFormatter::updateSaturation(uint8_t value) {
  const GroupState* ourState = this->stateStore->get(this->deviceId, this->groupId, REMOTE_TYPE_FUT100);
  BulbMode originalBulbMode = BulbMode::BULB_MODE_WHITE;

  if (ourState != NULL) {
    originalBulbMode = ourState->getBulbMode();
  }

  if (ourState != NULL && (settings->enableAutomaticModeSwitching) && (originalBulbMode != BulbMode::BULB_MODE_COLOR)) {
    updateHue(ourState->getHue());
  }

  command(0x07, 100 - value); // SATURATION

  if (ourState != NULL && (settings->enableAutomaticModeSwitching) && (originalBulbMode != BulbMode::BULB_MODE_COLOR)) {
    switchMode(*ourState, originalBulbMode);
  }
}

void FUT100PacketFormatter::updateColorWhite() {
  command(0x01, 0x14); // FUT100_WHITE_MODE
}

void FUT100PacketFormatter::enableNightMode() {
  if (groupId <= 8) {
    // Standard V2 Nachtmodus für G0-G8
    // Nutzt das "OFF" Argument der jeweiligen Gruppe (groupId + 9)
    uint8_t arg = groupId + 9; 
    command(0x01 | 0x80, arg);
  } else {
    // Nachtmodus für G9-G100
    // Basierend auf der FUT100 Logik: OFF-Argument für G9-G100 + High Bit
    uint8_t arg = ((groupId - 9) * 2) + 1;
    command(0x08 | 0x80, arg);
  }
}

BulbId FUT100PacketFormatter::parsePacket(const uint8_t *packet, JsonObject result) {
  uint8_t packetCopy[V2_PACKET_LEN];
  memcpy(packetCopy, packet, V2_PACKET_LEN);
  V2RFEncoding::decodeV2Packet(packetCopy);

  BulbId bulbId(
    (packetCopy[2] << 8) | packetCopy[3],
    packetCopy[7],
    REMOTE_TYPE_FUT100
  );

  uint8_t cmd = (packetCopy[V2_COMMAND_INDEX] & 0x7F);
  uint8_t arg = packetCopy[V2_ARGUMENT_INDEX];

  // G0-G8 (Kommando 0x01) - Nutzt exakt die FUT100 Parse-Logik
  if (cmd == 0x01) {
    if ((packetCopy[V2_COMMAND_INDEX] & 0x80) == 0x80) {
      result[GroupStateFieldNames::COMMAND] = MiLightCommandNames::NIGHT_MODE;
    } else if (arg == 0x13) {
      result[GroupStateFieldNames::COMMAND] = MiLightCommandNames::MODE_SPEED_DOWN;
    } else if (arg == 0x12) {
      result[GroupStateFieldNames::COMMAND] = MiLightCommandNames::MODE_SPEED_UP;
    } else if (arg == 0x14) {
      result[GroupStateFieldNames::COMMAND] = MiLightCommandNames::SET_WHITE;
    } else if (arg <= 8) { 
      result[GroupStateFieldNames::STATE] = "ON";
      bulbId.groupId = arg;
    } else if (arg >= 9 && arg <= 17) {
      result[GroupStateFieldNames::STATE] = "OFF";
      bulbId.groupId = arg - 9;
    }
  } 
  // G9-G100 (Kommando 0x08) - Die neue FUT100 Parse-Logik
  else if (cmd == 0x08) {
    result[GroupStateFieldNames::STATE] = ((arg % 2) == 0) ? "ON" : "OFF";
    bulbId.groupId = (arg / 2) + 9;
  } 
  // Restliche Befehle (Farbe, Helligkeit etc. sind bei FUT100 und FUT100 identisch)
  else if (cmd == 0x02) {
    result[GroupStateFieldNames::HUE] = Units::rescale<uint16_t, uint16_t>(arg, 360, 255.0);
  } else if (cmd == 0x05) {
    result[GroupStateFieldNames::BRIGHTNESS] = Units::rescale<uint8_t, uint8_t>(constrain(arg, 0, 100), 255, 100);
  } else if (cmd == 0x07) {
    const GroupState* state = stateStore->get(bulbId);
    if (state != NULL && state->getBulbMode() == BULB_MODE_COLOR) {
      result[GroupStateFieldNames::SATURATION] = 100 - constrain(arg, 0, 100);
    } else {
      result[GroupStateFieldNames::COLOR_TEMP] = Units::whiteValToMireds(100 - arg, 100);
    }
  } else if (cmd == 0x06) {
    result[GroupStateFieldNames::MODE] = arg;
  }

  return bulbId;
}