// TEST FIXTURE — fake values; struct names as at controller >= 6.9.x.
struct ODUCoolingSupportSettings {
    double cooling_stop_temperature = 20.5;
    double cooling_start_temperature = 27.5;
    double odu_cooling_setpoint = 22.5;
    std::chrono::seconds odu_cooling_start_delay_time = std::chrono::seconds(361);
    std::chrono::seconds odu_cooling_minimum_on_time = std::chrono::seconds(362);
};
struct ODUHeatingSupportSettings {
    double odu_heating_start_temperature = 20.1;
    double odu_heating_stop_temperature = 30.1;
    double odu_heating_min_setpoint = 22.1;
    double odu_heating_max_setpoint = 25.1;
};
struct ODUChargingSupportSettings {
    double odu_heating_start_temperature = 20.2;
    double odu_heating_stop_temperature = 26.2;
    double odu_heating_setpoint = 23.2;
};
struct ODUMixedHeatingCoolingSupportSettings {
    double odu_heating_start_temperature = 20.3;
    double odu_heating_stop_temperature = 30.3;
    double odu_cooling_start_temperature = 32.3;
    double odu_cooling_stop_temperature = 23.3;
    double odu_heating_setpoint = 26.3;
    double odu_cooling_setpoint = 25.3;
};
