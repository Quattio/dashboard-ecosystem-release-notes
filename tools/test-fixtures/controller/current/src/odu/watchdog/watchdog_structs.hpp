// TEST FIXTURE — fake values.
namespace watchdog {
struct Parameters {
    double inlet_temperature_heating_trigger = 6.1;
    double ambient_temperature_pump_trigger = 6.2;
    double inlet_temperature_pump_trigger = 8.1;
    uint16_t max_frequency_for_overcurrent_protection = 78;
    uint16_t max_frequency_for_overcurrent_protection_v2 = 71;
    double anti_freeze_pump_percentage = 7.5;
    double min_temperature_for_odu_commissioning = 17.5;
    double outlet_temperature_defrost_min = 5.5;
    double volt_hp_max = 254.0;
    double volt_hp_min = 181.0;
    double current_max = 15.0;
    double min_evaporator_pressure = 1.1;
    double inlet_temperature_minimum = 5.1;
    double out_of_spec_temperature_v1 = 58.0;
    double out_of_spec_temperature_hysteresis_v1 = 51.0;
    double out_of_normal_temperature_threshold_v1 = 53.0;
    double out_of_normal_delta_temperature_hysteresis_v1 = 3.5;
    double out_of_spec_temperature_v2 = 73.0;
    double out_of_spec_temperature_hysteresis_v2 = 54.0;
    double out_of_normal_temperature_threshold_v2 = 61.0;
    double out_of_normal_delta_temperature_hysteresis_v2 = 5.5;
    double minimum_flowrate = 410.0;
    double minimum_flowrate_out_of_normal = 510.0;
    double inlet_temperature_heating_trigger_hysteresis = 16.5;
    double inlet_temperature_pump_trigger_hysteresis = 12.5;
    double ambient_temperature_pump_trigger_hysteresis = 8.5;
};
struct HeatpumpSpecificParameters {
    // decoy: same symbol names, must NOT be picked up (scope test)
    double out_of_spec_temperature_v1 = 999.0;
};
}
