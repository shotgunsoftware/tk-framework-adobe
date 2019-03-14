"""
Adobe CC Framework
"""
import sgtk


class AdobeFramework(sgtk.platform.Framework):

    ##########################################################################################
    # init and destroy

    def init_framework(self):
        self.logger.debug("%s: Initializing..." % self)

    def destroy_framework(self):
        self.logger.debug("%s: Destroying..." % self)

