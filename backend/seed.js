import 'dotenv/config';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ----------- READ JSON FILES -----------
const gwaterRaw = fs.readFileSync('./GWATERLVL.json', 'utf-8');
const allData = JSON.parse(gwaterRaw);

// ----------- HELPER FUNCTIONS -----------
const districtKey = (it) => `${it.district ?? it.districtName ?? 'Unknown'}-${it.state ?? 'Unknown'}`;

function generateDummyWaterLevels(station, days = 100) {
  const levels = [];
  const now = new Date();

  for (let i = 0; i < days; i++) {
    const ts = new Date(now.getTime() - i * 24 * 60 * 60 * 1000); // past i days
    const depth = station.well_depth ?? 20;

    let waterLevel;
    const rand = Math.random();
    if (rand < 0.2) waterLevel = -depth;            // critical/empty
    else if (rand < 0.5) waterLevel = -depth * 0.5; // low
    else if (rand < 0.8) waterLevel = -depth * 0.25; // normal
    else waterLevel = -depth * 0.1;                 // almost full

    levels.push({
      station_name: station.station_name,
      timestamp: ts.toISOString(),
      water_level: waterLevel,
      rainfall: Math.random() * 15, // mm
      temperature: 20 + Math.random() * 10, // °C
    });
  }
  return levels;
}

function generateDummyStations() {
  return [
    {
      station_name: 'Rajghat_1',
      district: 'Baleshwar',
      state: 'Odisha',
      latitude: 21.5,
      longitude: 86.8,
      well_depth: 40,
      aquifer_type: 'Alluvial',
      station_status: 'Active',
      station_type: 'Observation',
      agency_name: 'CGWB',
      data_acquisition_mode: 'Manual',
      well_type: 'Open',
    },
    {
      station_name: 'Karnal_1',
      district: 'Karnal',
      state: 'Haryana',
      latitude: 29.7,
      longitude: 76.9,
      well_depth: 35,
      aquifer_type: 'Alluvial',
      station_status: 'Active',
      station_type: 'Observation',
      agency_name: 'CGWB',
      data_acquisition_mode: 'Automatic',
      well_type: 'Borewell',
    },
    {
      station_name: 'Raipur_1',
      district: 'Raipur',
      state: 'Chhattisgarh',
      latitude: 21.25,
      longitude: 81.63,
      well_depth: 50,
      aquifer_type: 'Sedimentary',
      station_status: 'Active',
      station_type: 'Observation',
      agency_name: 'CGWB',
      data_acquisition_mode: 'Manual',
      well_type: 'Open',
    },
    // Add more dummy stations as needed
  ];
}

// ----------- SEED DATABASE -----------
async function seedDatabase() {
  try {
    console.log('🧹 Clearing existing tables...');
    await supabase.from('water_levels').delete().neq('station_id', 0);
    await supabase.from('stations').delete().neq('station_id', 0);
    await supabase.from('districts').delete().neq('district_id', 0);
    await supabase.from('rainfall').delete().neq('rainfall_id', 0);

    // ---------- DISTRICTS ----------
    const districtMapInput = new Map();
    allData.forEach((item) => {
      const key = districtKey(item);
      if (!districtMapInput.has(key)) {
        districtMapInput.set(key, {
          district_name: item.district ?? item.districtName ?? 'Unknown',
          state: item.state ?? 'Unknown',
        });
      }
    });

    const dummyStations = generateDummyStations();
    dummyStations.forEach((st) => {
      const key = `${st.district}-${st.state}`;
      if (!districtMapInput.has(key)) {
        districtMapInput.set(key, {
          district_name: st.district,
          state: st.state,
        });
      }
    });

    const districtsPayload = Array.from(districtMapInput.values());
    const { data: insertedDistricts, error: districtError } = await supabase
      .from('districts')
      .upsert(districtsPayload, { onConflict: ['district_name', 'state'], ignoreDuplicates: true })
      .select();

    if (districtError) throw districtError;

    const districtMap = new Map();
    insertedDistricts.forEach((d) => {
      districtMap.set(`${d.district_name}-${d.state}`, d.district_id);
    });

    // ---------- STATIONS ----------
    const stationMapInput = new Map();

    // Odisha JSON stations
    allData.forEach((item) => {
      const stationName = item.stationName ?? item.description ?? `station-${Math.random().toString(36).substr(2,6)}`;
      const dKey = districtKey(item);
      stationMapInput.set(`${stationName}__${dKey}`, {
        station_name: stationName,
        district_id: districtMap.get(dKey),
        latitude: item.latitude ?? 0,
        longitude: item.longitude ?? 0,
        aquifer_type: item.wellAquiferType ?? 'Unknown',
        specific_yield: item.specificYield ?? 0.15,
        station_status: item.stationStatus ?? 'Active',
        station_type: item.stationType ?? 'Observation',
        agency_name: item.agencyName ?? 'CGWB',
        data_acquisition_mode: item.dataAcquisitionMode ?? 'Manual',
        well_type: item.wellType ?? 'Open',
        well_depth: item.wellDepth ?? 20,
      });
    });

    // Dummy stations
    dummyStations.forEach((st) => {
      const key = `${st.station_name}__${st.district}-${st.state}`;
      stationMapInput.set(key, {
        station_name: st.station_name,
        district_id: districtMap.get(`${st.district}-${st.state}`),
        latitude: st.latitude,
        longitude: st.longitude,
        aquifer_type: st.aquifer_type,
        specific_yield: 0.15,
        station_status: st.station_status,
        station_type: st.station_type,
        agency_name: st.agency_name,
        data_acquisition_mode: st.data_acquisition_mode,
        well_type: st.well_type,
        well_depth: st.well_depth,
      });
    });

    const stationsPayload = Array.from(stationMapInput.values());
    const { data: insertedStations, error: stationError } = await supabase
      .from('stations')
      .upsert(stationsPayload, { onConflict: ['station_name', 'district_id'], ignoreDuplicates: true })
      .select();

    if (stationError) throw stationError;

    const stationMap = new Map();
    insertedStations.forEach((s) => stationMap.set(s.station_name, s.station_id));

    // ---------- WATER LEVELS ----------
    let waterLevelsPayload = [];

    // Odisha JSON water levels
    waterLevelsPayload = allData.map((item) => {
      let ts = null;
      if (item.dataTime?.year) {
        ts = new Date(
          item.dataTime.year,
          (item.dataTime.monthValue ?? 1) - 1,
          item.dataTime.dayOfMonth ?? 1,
          item.dataTime.hour ?? 0,
          item.dataTime.minute ?? 0,
          item.dataTime.second ?? 0
        ).toISOString();
      } else if (item.timestamp) ts = new Date(item.timestamp).toISOString();

      const stationName = item.stationName ?? item.description ?? null;
      const station_id = stationName ? stationMap.get(stationName) ?? null : null;

      return {
        station_id,
        timestamp: ts,
        water_level: item.dataValue ?? 0,
        rainfall: item.rainfall ?? 0,
        temperature: item.temperature ?? 25,
        season: null,
      };
    });

    // Dummy stations water levels
    dummyStations.forEach((st) => {
      const levels = generateDummyWaterLevels(st, 100);
      levels.forEach((lv) => {
        const station_id = stationMap.get(lv.station_name);
        waterLevelsPayload.push({
          station_id,
          timestamp: lv.timestamp,
          water_level: lv.water_level,
          rainfall: lv.rainfall,
          temperature: lv.temperature,
          season: null,
        });
      });
    });

    const { error: wlError } = await supabase
      .from('water_levels')
      .upsert(waterLevelsPayload, { onConflict: ['station_id', 'timestamp'], ignoreDuplicates: true });

    if (wlError) throw wlError;

    // ---------- RAINFALL ----------
    let rainfallPayload = [];

    // Odisha JSON rainfall
    allData.forEach((item) => {
      if (item.rainfall && item.rainfall >= 0) {
        const station_id = stationMap.get(item.stationName ?? item.description);
        rainfallPayload.push({
          station_code: `GW-${station_id}`,
          station_name: item.stationName ?? item.description,
          state: item.state ?? 'Odisha',
          district: item.district ?? item.districtName,
          data_time: new Date(item.timestamp ?? new Date()).toISOString(),
          rainfall_mm: item.rainfall,
        });
      }
    });

    // Dummy stations rainfall
    dummyStations.forEach((st) => {
      const levels = generateDummyWaterLevels(st, 100);
      levels.forEach((lv) => {
        const station_id = stationMap.get(lv.station_name);
        rainfallPayload.push({
          station_code: `GW-${station_id}`,
          station_name: lv.station_name,
          state: st.state,
          district: st.district,
          data_time: lv.timestamp,
          rainfall_mm: lv.rainfall,
        });
      });
    });

    const { error: rainfallError } = await supabase
      .from('rainfall')
      .upsert(rainfallPayload, { onConflict: ['station_code', 'data_time'], ignoreDuplicates: true });

    if (rainfallError) throw rainfallError;

    console.log('🎉 Seed completed successfully:', {
      districts: insertedDistricts.length,
      stations: insertedStations.length,
      water_levels: waterLevelsPayload.length,
      rainfall: rainfallPayload.length,
    });
  } catch (err) {
    console.error('❌ Seeding failed:', err);
  }
}

seedDatabase();
