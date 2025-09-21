# groundwaterForecast.py
import pandas as pd
import numpy as np
from datetime import timedelta
from statsmodels.tsa.arima.model import ARIMA
from supabase import create_client, Client
import matplotlib.pyplot as plt
from statsmodels.graphics.tsaplots import plot_acf, plot_pacf

# --- 1: SUPABASE CONFIG (use your credentials)
SUPABASE_URL = "https://udkqseribwkkloktyozc.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVka3FzZXJpYndra2xva3R5b3pjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxMDQyNDQsImV4cCI6MjA3MzY4MDI0NH0.aT1yeG9sPK1RLsoMLCfDLfpUS2bagH8FoeByTKC5UqE"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def fetch_water_levels():
    """Fetch water level data from Supabase water_levels table."""
    response = supabase.table("water_levels").select("station_id, timestamp, water_level").order("station_id").order("timestamp").execute()
    data = response.data

    if not data:
        print("⚠️ No water level data found.")
        return pd.DataFrame(columns=["station_id", "timestamp", "water_level"])

    df = pd.DataFrame(data)
    df["timestamp"] = pd.to_datetime(df["timestamp"])  # ensure proper datetime
    return df

def forecast_arima(series, steps=5, plot_diagnostics=True):
    """Train ARIMA on 80% of data, forecast on remaining 20%, and return future forecast."""
    split_idx = int(len(series) * 0.8)
    train, test = series.iloc[:split_idx], series.iloc[split_idx:]

    # --- Plot ACF/PACF for diagnostics
    if plot_diagnostics:
        fig, axes = plt.subplots(1, 2, figsize=(14, 5), dpi=100)
        plot_acf(train.diff().dropna(), ax=axes[0], lags=30)
        axes[0].set_title("ACF - Autocorrelation", fontsize=14)
        axes[0].grid(alpha=0.3)

        plot_pacf(train.diff().dropna(), ax=axes[1], lags=30, method="ywm")
        axes[1].set_title("PACF - Partial Autocorrelation", fontsize=14)
        axes[1].grid(alpha=0.3)

        plt.tight_layout()
        plt.show()

    try:
        # You can tune p,d,q after checking ACF/PACF
        model = ARIMA(train, order=(1, 1, 1))
        model_fit = model.fit()

        # In-sample prediction on test set to evaluate accuracy
        test_forecast = model_fit.forecast(len(test))
        mse = np.mean((test.values - test_forecast.values) ** 2)
        print(f"📊 Test MSE: {mse:.4f}")

        # Future forecast
        future_forecast = model_fit.forecast(steps=steps)
        return future_forecast
    except Exception as e:
        print(f"ARIMA failed: {e}")
        return []

def insert_predictions(predictions):
    """Insert ARIMA forecast results into Supabase water_level_predictions table."""
    if not predictions:
        print("⚠️ No predictions to insert.")
        return

    rows = [
        {
            "station_id": station_id,
            "predicted_timestamp": ts.isoformat(),
            "predicted_water_level": float(value),
            "model_type": "ARIMA"
        }
        for station_id, ts, value in predictions
    ]

    response = supabase.table("water_level_predictions").insert(rows).execute()
    if response.status_code >= 200 and response.status_code < 300:
        print(f"✅ Inserted {len(rows)} ARIMA predictions")
    else:
        print(f"❌ Failed to insert predictions: {response}")

def main():
    df = fetch_water_levels()
    predictions_to_insert = []

    for station_id, group in df.groupby("station_id"):
        group = group.sort_values("timestamp")
        series = group["water_level"]

        # determine forecast dates
        last_date = group["timestamp"].iloc[-1]
        future_dates = [last_date + timedelta(days=i) for i in range(1, 6)]

        arima_forecast = forecast_arima(series, steps=5, plot_diagnostics=True)
        for date, value in zip(future_dates, arima_forecast):
            predictions_to_insert.append((station_id, date, value))

    #insert_predictions(predictions_to_insert)

if __name__ == "__main__":
    main()
