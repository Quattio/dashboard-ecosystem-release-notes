// TEST FIXTURE — fake values; struct names as at controller < 6.9.x; NO charging struct.
struct ODUCoolingSettings {
    double cooling_stop_temperature = 18.5;
    double cooling_start_temperature = 25.5;
    double odu_cooling_setpoint = 20.5;
    std::chrono::seconds odu_cooling_start_delay_time = std::chrono::seconds(361);
    std::chrono::seconds odu_cooling_minimum_on_time = std::chrono::seconds(362);
};
struct ODUHeatingSettings {
    double odu_heating_start_temperature = 20.1;
    double odu_heating_stop_temperature = 30.1;
    double odu_heating_min_setpoint = 22.1;
    double odu_heating_max_setpoint = 25.1;
};
struct ODUMixedSettings {
    double odu_heating_start_temperature = 18.3;
    double odu_heating_stop_temperature = 28.3;
    double odu_cooling_start_temperature = 30.3;
    double odu_cooling_stop_temperature = 21.3;
    double odu_heating_setpoint = 24.3;
    double odu_cooling_setpoint = 23.3;
};
