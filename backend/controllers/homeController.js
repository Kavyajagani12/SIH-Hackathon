// controllers/homeController.js
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime.js';

dotenv.config();
dayjs.extend(relativeTime);

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

/**
 * GET /api/home?user_id=1&search=bangalore
 * Returns all stations for the user with card-ready data, optionally filtered by district or state
 */
export const getHomeStations = async (req, res) => {
  try {
    const { user_id, search } = req.query;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });

    // 1️⃣ Get districts matching optional search (ignore user location)
    let query = supabase.from('districts').select('district_id,district_name,state');

    // If search term exists, filter by district_name or state
    if (search) {
      // Use more flexible search - check if search term contains district name or vice versa
      query = query.or(
        `district_name.ilike.%${search}%,state.ilike.%${search}%,district_name.ilike.${search}%,state.ilike.${search}%`
      );
    }

    const { data: districts } = await query;
    if (!districts || districts.length === 0) return res.json([]);

    const districtIds = districts.map(d => d.district_id);
    
    // Create a map for quick district lookup
    const districtMap = {};
    districts.forEach(d => {
      districtMap[d.district_id] = { name: d.district_name, state: d.state };
    });

    // 3️⃣ Get stations in these districts
    const { data: stations } = await supabase
      .from('stations')
      .select('station_id,station_name,district_id,specific_yield,latitude,longitude,aquifer_type,well_depth')
      .in('district_id', districtIds);

    // 4️⃣ Prepare card data
    const cardData = await Promise.all(
      stations.map(async (station) => {
        // Fetch last 2 water level readings
        // 1️⃣ Get districts matching optional search (ignore user location)
        let query = supabase.from('districts').select('district_id,district_name,state');
        if (search) {
          query = query.or(
            `district_name.ilike.%${search}%,state.ilike.%${search}%`
          );
        }
        const { data: districts } = await query;
        if (!districts || districts.length === 0) return res.json([]);
        const districtIds = districts.map(d => d.district_id);

        // 2️⃣ Get stations in these districts
        const { data: stations } = await supabase
          .from('stations')
          .select('station_id,station_name,district_id,specific_yield,latitude,longitude,aquifer_type,well_depth')
          .in('district_id', districtIds);

        // 3️⃣ Prepare card data
        const cardData = await Promise.all(
          stations.map(async (station) => {
            // Fetch last 2 water level readings
            const { data: waterLevels } = await supabase
              .from('water_levels')
              .select('water_level,timestamp')
              .eq('station_id', station.station_id)
              .order('timestamp', { ascending: false })
              .limit(2);

            const latest = waterLevels?.[0];
            const previous = waterLevels?.[1];

            // Determine trend
            let waterLevelTrend = 'Flat';
            if (latest && previous) {
              if (latest.water_level > previous.water_level) waterLevelTrend = 'Up';
              else if (latest.water_level < previous.water_level) waterLevelTrend = 'Down';
            }

           let aquiferFillPercentage = 0;
let maxDepth = station.well_depth ?? 1; // avoid division by zero

if (latest && station.well_depth != null) {
  aquiferFillPercentage = (latest.water_level + station.well_depth) / station.well_depth;
}

// Determine status
let status = 'Inactive';

if (latest) {
  if (aquiferFillPercentage >= 0.9) {
    status = 'High';
  } else if (aquiferFillPercentage >= 0.5) {
    status = 'Normal';
  } else if (aquiferFillPercentage >= 0.2) {
    status = 'Low';
  } else {
    status = 'Critical';
  }
}

            

            // Last updated
            const lastUpdated = latest ? dayjs(latest.timestamp).fromNow() : 'No data';

            return {
              station_id: station.station_id,
              locationName: station.station_name,
              latitude: station.latitude,
              longitude: station.longitude,
              aquiferType: station.aquifer_type,
              status:status,
              waterLevel: latest?.water_level ?? null,
              waterLevelTrend,
              lastUpdated:lastUpdated,
              isActive: !!latest,
              aquiferFillPercentage:aquiferFillPercentage,
              maxDepth:maxDepth,
            };
          })
        );

        res.json(cardData);
      })
    );
  } catch (err) {
    console.error('Error in getHomeStations:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * GET /api/districts
 * Returns all districts and states for dropdown selection
 */
export const getDistricts = async (req, res) => {
  try {
    const { data: districts, error } = await supabase
      .from('districts')
      .select('district_id, district_name, state')
      .order('state')
      .order('district_name');

    if (error) {
      console.error('Error fetching districts:', error);
      return res.status(500).json({ error: 'Failed to fetch districts' });
    }

    // Group by state for better organization
    const groupedData = districts.reduce((acc, district) => {
      const state = district.state;
      if (!acc[state]) {
        acc[state] = [];
      }
      acc[state].push({
        district_id: district.district_id,
        district_name: district.district_name
      });
      return acc;
    }, {});

    res.json({
      states: Object.keys(groupedData).sort(),
      districts: groupedData
    });
  } catch (err) {
    console.error('Error in getDistricts:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

