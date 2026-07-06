// TEST FIXTURE — fake regions.
const std::vector<FrequencyRegion> kV1HeatingRegions = {
    {300, kMinTemp, 12.0, kMinTemp, 55.0, {0, 31, 45, 91}, {0, 1, 2, 3}},
};
const std::vector<FrequencyRegion> kV2HeatingRegions = {
    {400, kMinTemp, -5.0, kMinTemp, 55.0, {0, 21, 45, 89}, {0, 1, 2, 3}},
};
const std::vector<FrequencyRegion> kV2_1HeatingRegions = {
    {500, kMinTemp, -12.0, kMinTemp, 57.0, {0, 22, 45, 111}, {0, 3, 4, 20}},
};
const std::vector<FrequencyRegion> kV1CoolingRegions = {
    {100, kMinTemp, 11.0, kMinTemp, kMaxTemp, {0, 32, 73}, {0, 1, 2}},
};
const std::vector<FrequencyRegion> kV2CoolingRegions = {
    {200, kMinTemp, 11.0, kMinTemp, kMaxTemp, {0, 33, 72}, {0, 1, 2}},
};
