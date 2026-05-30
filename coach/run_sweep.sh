#!/bin/bash
#SBATCH --job-name=gw_variance_sweep
#SBATCH --reservation=s_tra_ncc        # hackathon reservation (from AI:AT deck)
#SBATCH --partition=boost_usr_prod
#SBATCH --output=%x_%A_%a.out
#SBATCH --error=%x_%A_%a.err
#SBATCH --nodes=1
#SBATCH --ntasks-per-node=1
#SBATCH --cpus-per-task=4              # CPU-only job; no GPU needed (deterministic)
#SBATCH --time=00:20:00

# --- grid: 5 alphas x 5 floors = 25 tasks (sbatch --array=0-24 run_sweep.sh) ---
ALPHAS=(0.05 0.10 0.15 0.20 0.25)
FLOORS=(0.05 0.10 0.15 0.20 0.25)
ALPHA=${ALPHAS[$((SLURM_ARRAY_TASK_ID % 5))]}
FLOOR=${FLOORS[$((SLURM_ARRAY_TASK_ID / 5))]}

# results go to scratch (NOT $HOME — 50GB cap, not backed up)
export SCRATCH=${SCRATCH:-$HOME/gw_results}
mkdir -p "$SCRATCH"

# environment: pixi (AI:AT standard) — falls back to module python if absent
if command -v pixi >/dev/null 2>&1; then
    RUN="pixi run python3"
else
    module load python/3.11.7 2>/dev/null || true
    RUN="python3"
fi

echo "task=$SLURM_ARRAY_TASK_ID alpha=$ALPHA floor=$FLOOR -> $SCRATCH"
$RUN leo_sweep.py "$ALPHA" "$FLOOR"
