"""Processing presets. Each preset is a complete parameter set for the cleaning, reconstruction, refinement and colour stages; any value can be edited in the UI.
A stage entry of None means that step is switched off. Values here are starting points chosen on the bundled sample scans; they are not guaranteed optimal for every scan."""
from __future__ import annotations

import copy

STAT = {"neighbors": 20, "std_ratio": 2.0}
BASE_CLEAN = {"crop": None, "invalid": {}, "duplicates": {}, "statistical": dict(STAT), "radius": {"radius": 0.0, "min_points": 6, "spacing_factor": 4.0}, "isolated": None, "density": None, "floating": {"radius_factor": 6.0, "min_fraction": 0.02}, "denoise": None, "downsample": None}
BASE_RECON = {"method": "auto", "depth": 9, "normal_neighbors": 30, "orient": "tangent", "density_trim": 0.02, "trim_factor": 3.0, "point_weight": 4.0, "samples_per_node": 1.5, "radius_factors": [1.5, 2.5, 4.0], "alpha_factor": 3.0}
BASE_REFINE = {"degenerate": {}, "small_components": {"min_fraction": 0.05}, "non_manifold": {}, "normals": {}, "fill_holes": None, "smooth": None, "remesh": None, "refine_edges": None, "decimate": None, "optimize": {}}
BASE_COLOR = {"transfer": True, "clean": None}


def _p(clean=None, recon=None, refine=None, color=None):
    return {"clean": {**copy.deepcopy(BASE_CLEAN), **(clean or {})}, "reconstruct": {**copy.deepcopy(BASE_RECON), **(recon or {})}, "refine": {**copy.deepcopy(BASE_REFINE), **(refine or {})}, "color": {**copy.deepcopy(BASE_COLOR), **(color or {})}}


PRESETS = {
    "quick": {"label": "Quick Cleanup", "description": "Fast removal of obvious scanning noise, then a plain reconstruction with light smoothing.",
              **_p({"statistical": {"neighbors": 16, "std_ratio": 2.5}}, {"depth": 8}, {"smooth": {"method": "taubin", "iterations": 5, "preserve_features": 0.7, "feature_angle": 40.0}})},
    "balanced": {"label": "Balanced Reconstruction", "description": "A balance of detail and smoothness: outlier and floater removal, light denoising, Screened Poisson, hole filling, Taubin smoothing, moderate decimation.",
                 **_p({"isolated": {"radius_factor": 4.0, "min_cluster": 20}, "denoise": {"neighbors": 16, "strength": 0.4}}, {"method": "screened_poisson", "depth": 9},
                      {"fill_holes": {"max_hole_edges": 30}, "smooth": {"method": "taubin", "iterations": 10, "preserve_features": 0.8, "feature_angle": 40.0}, "decimate": {"ratio": 0.5}})},
    "high": {"label": "High Quality", "description": "Dense, detailed reconstruction with careful denoising and bilateral plus Taubin refinement; little decimation.",
             **_p({"statistical": {"neighbors": 30, "std_ratio": 1.8}, "isolated": {"radius_factor": 4.0, "min_cluster": 30}, "density": {"neighbors": 12, "min_density_ratio": 0.1}, "denoise": {"neighbors": 20, "strength": 0.5}}, {"method": "screened_poisson", "depth": 10, "trim_factor": 2.5},
                  {"fill_holes": {"max_hole_edges": 40}, "smooth": {"method": "bilateral", "iterations": 4, "preserve_features": 0.9, "feature_angle": 35.0}, "decimate": {"ratio": 0.8}})},
    "product": {"label": "Product Quality", "description": "Smooth, professional surfaces that keep edges: strong feature-preserving denoising, Screened Poisson, bilateral then Taubin smoothing, hole filling and regularised triangles.",
                **_p({"isolated": {"radius_factor": 4.0, "min_cluster": 30}, "denoise": {"neighbors": 20, "strength": 0.8}}, {"method": "screened_poisson", "depth": 9, "trim_factor": 2.5, "point_weight": 6.0},
                     {"fill_holes": {"max_hole_edges": 60}, "smooth": {"method": "bilateral", "iterations": 6, "preserve_features": 1.0, "feature_angle": 35.0, "max_move": 0.5}, "decimate": {"ratio": 0.4, "preserve_boundary": True}})},
    "organic": {"label": "Organic Objects", "description": "Preserves natural curves: Poisson reconstruction, curvature-aware Taubin smoothing that keeps detail on strongly curved areas, hole filling and moderate decimation.",
                **_p({"isolated": {"radius_factor": 4.0, "min_cluster": 20}, "denoise": {"neighbors": 24, "strength": 0.5}}, {"method": "poisson", "depth": 9, "density_trim": 0.03},
                     {"fill_holes": {"max_hole_edges": 80}, "smooth": {"method": "taubin", "iterations": 20, "preserve_features": 0.3, "curvature_aware": True, "feature_angle": 60.0}, "decimate": {"ratio": 0.5}})},
    "hard_surface": {"label": "Hard Surface", "description": "Preserves corners and sharp edges: no point denoising, sharper Screened Poisson, bilateral smoothing with frozen sharp edges, planar-aware decimation.",
                     **_p({"denoise": None}, {"method": "screened_poisson", "depth": 10, "point_weight": 10.0, "trim_factor": 2.0},
                          {"fill_holes": {"max_hole_edges": 30}, "smooth": {"method": "bilateral", "iterations": 6, "preserve_features": 1.0, "feature_angle": 30.0, "max_move": 0.3}, "decimate": {"ratio": 0.3, "planar": True, "preserve_normals": True}})},
}


def preset(name: str) -> dict:
    if name not in PRESETS: raise KeyError(f"Unknown preset '{name}'.")
    return copy.deepcopy(PRESETS[name])
