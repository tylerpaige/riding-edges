I have been incorrectly describing the objective. Please refactor the animation to follow this new specification. To get on the same page, understand these conventions:

* RTL: rectangle's top left corner
* RTR: rectange's top right corner
* BTL: rectangle's bottom left corner
* BTR: rectangle's bottom right corner
* RT: rectangle's top edge
* RR: rectangle's right edge
* RB: rectangle's bottom edge
* RL: rectangle's left edge
* RW: rectangle's width
* RH: rectangle's height
* VTL: viewport's top left corner
* VTR: viewport's top right corner
* VBL: viewport's bottom left corner
* VBR: viewport's bottom right corner
* VT: viewport's top edge
* VR: viewport's right edge
* VB: viewport's bottom edge
* VL: viewport's left edge
* Coordinate system: VBL is (0, 0) and VTR is (100, 100)

Rules:
* The rectangle has a consistent width through the entire animation. This is a configuration option defaulting to 10vmin.
* The rectangle needs a minimum height. Let's make this a configuration option defaulting to 10vmin as well.
* The rectangle is rotated -45 degrees.

Steps:
* Firstly Identify the viewport's major axis: width or height.
* Place the rectangle in VBL such that RTL touches VL and RBL touches VB. This can be found by solving for a 45/45/90 right triangle. The length of the hypotenuse is the minimum RH.

If the major axis is the width:
* Move the RBL along the VB
* As it moves, grow the height from RB until RTL or RTR collide with VL or VT.
* Continue in this way until RBL passes (50, 0).
* Once RBL passes (50, 0), start moving RTR along the VT at the same rate as before.
* Continue adjusting the height, but this time adjust from RT. Adjust the height until RBL or RBR collides with VR or VB.
* Finish when rectangle is the same distance from the VTR, as it was from the VBL at the start.

If the major axis is the height:
* Move the RTL along the VL
* As it moves, adjust the height from RT until RBL or RBR collide with VR or VB.
* Continue in this way until RTL passes (0, 50).
* Once RTL passes (0, 50), start moving RBR along the VT at the same rate as before.
* Continue adjusting the width, but this time adjust from RB. Adjust the width until RTL or RTR collides with VL or VT.
* Finish when rectangle is the same distance from the VTR, as it was from the VBL at the start
