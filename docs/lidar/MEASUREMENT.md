# Units and measurement semantics

* Coordinates are numbers in the file's unit. LAS/LAZ: unit from GeoKeys/WKT (horizontal and vertical may differ). PLY/PCD/XYZ: **unknown** unless declared.
* With unknown units a measurement is reported in "file units" and no metre/feet figure is produced. Parameters (thresholds in metres, e.g. 3 m height) are converted only when the unit is known; otherwise defaults are expressed in file units with a warning.
* Mixed horizontal/vertical units: distances that combine both are refused with an explanation.
* Types: **point↔point** straight line; **point↔wire** shortest distance to the fitted curve inside its span; **wire↔wire** minimum distance between fitted curves (3-D); **wire↔ground** minimum vertical clearance above the ground model under the span; **wire↔object** / **point↔object** minimum distance to points of a selected class; **point↔ground** vertical height above the ground model.
* Each result carries validity notes (e.g. "ground model interpolated under span", "fit residual 0.04").
* A threshold is a user criterion. The result shows "below / above your criterion"; it never says pass/fail against a regulation.
