# Limitations

* Wire detection was validated on the synthetic corridor (all 9 wire conductors found, endpoints and sag within the test tolerances). On the real tile there is no ground truth for wires; results there are unverified candidates (often roof edges and railings).
* Heuristic classification is rule-based on geometry; it confuses low walls, vegetation under canopy and steep terrain. Use provided labels when available.
* Wires thinner than the point spacing, or one or two returns across, will be missed. Sparse data gives "could not identify".
* Catenary is approximated by a parabola per span; long spans with strong sag differences between supports are split.
* Clouds are held in memory (size and point caps apply); the viewer shows a decimated subset.
* Not a survey tool and not a compliance tool.
* Timings (4 vCPU, 1.6 M points): heuristic classification ≈16 s, wire detection ≈13 s.
