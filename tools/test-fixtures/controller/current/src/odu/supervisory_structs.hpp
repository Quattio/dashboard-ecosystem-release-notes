// TEST FIXTURE — fake values.
struct ControlParameters {
    double commissioning_flow_test_ref_flow_rate = 1001;
    double commissioning_4kw_flow_test_pwm_level_limit = 99;
    double commissioning_8kw_flow_test_pwm_level_limit = 85;
    double ref_circ_flow_rate_hr = 801;
    uint16_t maximum_compressor_frequency_heatpump_outlet_temperature_above_normal = 56;
    int cop_hysteris_lower_percent = 1;
    int cop_hysteris_upper_percent = 16;
    double min_power_demand_threshold = 201;
    double sticky_pump_protection_percentage = 5.5;
    double min_cooling_demand_odu_upper = 101;
    double min_cooling_demand_odu_lower = 51;
    double cooling_threshold_both_odus = 2001;
    double cop_correction_return_temperature_offset = 2.6;
    double max_supply_temperature_default = 71.0;
    double standard_room_temperature_setpoint = 20.5;
    double boiler_power_turn_on_threshold = 2501.0;
    double boiler_power_turn_off_threshold = 1001.0;
    double deaeration_pump_percentage = 71.0;
    double deaeration_pump_on_time = 31;
    double deaeration_pump_off_time = 32;
    double hpLowTestFrequency = 30;
    double hpMediumTestFrequency = 48;
    double hpMediumTestFrequencyV2 = 31;
};
