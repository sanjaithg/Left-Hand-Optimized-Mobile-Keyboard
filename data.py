# plot_emg.py
import os
import webbrowser
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots

# Path to your CSV on Desktop (cross-platform)
csv_path = os.path.expanduser("~/Desktop/data.csv")

# Read CSV
if not os.path.exists(csv_path):
    raise FileNotFoundError(f"Could not find file: {csv_path}\nPut your CSV at this path or update csv_path in the script.")
df = pd.read_csv(csv_path)

# Helper to safely get column (with fallback names)
def get_col(df, *candidates):
    for c in candidates:
        if c in df.columns:
            return df[c]
    raise KeyError(f"None of the candidates found in CSV columns: {candidates}\nAvailable columns: {list(df.columns)[:20]}")

# Expected column names (adjust if your file uses different names)
# Using samples you showed: "X[s]_21","EMG21","X[s]_22","EMG22","X[s]_31","EMG31","X[s]_32","EMG32"
x21 = get_col(df, "X[s]_21", "X_s_21", "X21", "Time21")
emg21 = get_col(df, "EMG21", "EMG_21")

x22 = get_col(df, "X[s]_22", "X_s_22", "X22", "Time22")
emg22 = get_col(df, "EMG22", "EMG_22")

x31 = get_col(df, "X[s]_31", "X_s_31", "X31", "Time31")
emg31 = get_col(df, "EMG31", "EMG_31")

x32 = get_col(df, "X[s]_32", "X_s_32", "X32", "Time32")
emg32 = get_col(df, "EMG32", "EMG_32")

# Make sure time series are numeric
for s in (x21,x22,x31,x32, emg21,emg22,emg31,emg32):
    s[:] = pd.to_numeric(s, errors="coerce")
# Drop rows where time or emg are NaN pairwise for each trace is handled by Plotly automatically

# Create two-row subplot (shared x-axis disabled so each has its own range slider)
fig = make_subplots(rows=2, cols=1,
                    shared_xaxes=False,
                    vertical_spacing=0.08,
                    subplot_titles=("Series 21 & 22", "Series 32 & 31"))

# Top: X21 vs EMG21 (blue) and X22 vs EMG22 (orange)
fig.add_trace(go.Scatter(x=x21, y=emg21, mode="lines", name="EMG21 (X21)", line=dict(color="blue")),
              row=1, col=1)
fig.add_trace(go.Scatter(x=x22, y=emg22, mode="lines", name="EMG22 (X22)", line=dict(color="orange")),
              row=1, col=1)

# Bottom: X32 vs EMG32 (blue) and X31 vs EMG31 (orange)
fig.add_trace(go.Scatter(x=x32, y=emg32, mode="lines", name="EMG32 (X32)", line=dict(color="blue")),
              row=2, col=1)
fig.add_trace(go.Scatter(x=x31, y=emg31, mode="lines", name="EMG31 (X31)", line=dict(color="orange")),
              row=2, col=1)

# Layout: titles, axis labels, range slider on each subplot's x-axis
fig.update_layout(
    height=800,
    width=1200,
    title_text="EMG Time Series (Interactive)",
    legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1)
)

# Add x-axis labels and range slider / selector for each subplot separately
for i, xaxis_name in enumerate(["xaxis", "xaxis2"], start=1):
    fig['layout'][xaxis_name].update(
        title="Time (s)",
        rangeselector=dict(
            buttons=list([
                dict(count=1
