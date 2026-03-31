This application shows an animation that is powered by scroll. The animation's objective is to move a rectangle across the screen and simultaneously resize the rectangle's height so that it is always growing to the maximum amount allowed by the viewport's edges. In practice, this means that at least 2 of the rectangle's corner should be flush with the viewports edges at all times. The animation should have the rectangle moving from the bottom left corner to the top right corner.

To get on the same page, understand these conventions:

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
* VH: viewport height
* VW: viewport width
* Coordinate system: VBL is (0, 0) and VTR is (100, 100)

Rules:
* The rectangle has a consistent width through the entire animation. This is a configuration option defaulting to 10vmin.
* The rectangle needs a minimum height. Let's make this a configuration option defaulting to 10vmin as well.
* The rectangle is rotated -45 degrees.
* For any position the rectangle might occupy, at least 2 of the following must be true:
  * RTL's x coordinate is 0
  * RTR's y coordinate is VH
  * RBL's y coordinate is 0
  * RBR's x coordinate is VW
* The rectangle starts near VBL, such that RTL's x coordinate is 0 and RBL y coordinate is 0. The exact position can be found by solving for a 45/45/90 right triangle. The length of the hypotenuse is the minimum RH.
* Effect must work for horizontal and vertical viewports.

I will give you some slightly imprecise examples from my drawings. The numbers might be slightly off.

# Example 1

* Viewport width: 800px
* Viewport height: 400px
* Rectangle width: 20px
* Rectangle height: 20px
* Start: 
  * RTL: (0, 14)
  * RBL: (14, 0)
  * RTR: (14, 28)
  * RBR: (28, 14)
* Somewhere in between (about 25%)
  * RTL: (0, 200)
  * RBL: (200, 0)
  * RTR: (14, 215)
  * RBR: (215, 14)
* Another point between (maybe 66%?)
  * RTL: (214, 386)
  * RBL: (600, 0)
  * RTR: (230, 400)
  * RBR: (615, 14)
* End:
  * RTL: (772, 386)
  * RBL: (786, 372)
  * RTR: (786, 400)
  * RBR: (800, 386)

# Example 2

* Viewport width: 800px
* Viewport height: 600px
* Rectangle width: 20px
* Rectangle height: 20px
* Start: 
  * RTL: (0, 14)
  * RBL: (14, 0)
  * RTR: (14, 28)
  * RBR: (28, 14)
* Somewhere in between
  * RTL: (0, 400)
  * RBL: (200, 0)
  * RTR: (14, 215)
  * RBR: (215, 14)
* Another in between
  * RTL: (0, 400)
  * RBL: (400, 0)
  * RTR: (14, 414)
  * RBR: (414, 14)
* Another in between
  * RTL: (436, 586)
  * RBL: (785, 236)
  * RTR: (450, 600)
  * RBR: (800, 250)
* End:
  * RTL: (772, 586)
  * RBL: (786, 572)
  * RTR: (786, 600)
  * RBR: (800, 586)
