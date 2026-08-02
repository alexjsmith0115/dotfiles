# This is a sample commands.py.  You can add your own commands here.
#
# Please refer to commands_full.py for all the default commands and a complete
# documentation.  Do NOT add them all here, or you may end up with defunct
# commands when upgrading ranger.

# A simple command for demonstration purposes follows.
# -----------------------------------------------------------------------------

from __future__ import (absolute_import, division, print_function)

# You can import any python module as needed.
import os
import subprocess
from functools import partial

# You always need to import ranger.api.commands here to get the Command class:
from ranger.api.commands import Command


# Any class that is a subclass of "Command" will be integrated into ranger as a
# command.  Try typing ":my_edit<ENTER>" in ranger!
class my_edit(Command):
    # The so-called doc-string of the class will be visible in the built-in
    # help that is accessible by typing "?c" inside ranger.
    """:my_edit <filename>

    A sample command for demonstration purposes that opens a file in an editor.
    """

    # The execute method is called when you run this command in ranger.
    def execute(self):
        # self.arg(1) is the first (space-separated) argument to the function.
        # This way you can write ":my_edit somefilename<ENTER>".
        if self.arg(1):
            # self.rest(1) contains self.arg(1) and everything that follows
            target_filename = self.rest(1)
        else:
            # self.fm is a ranger.core.filemanager.FileManager object and gives
            # you access to internals of ranger.
            # self.fm.thisfile is a ranger.container.file.File object and is a
            # reference to the currently selected file.
            target_filename = self.fm.thisfile.path

        # This is a generic function to print text in ranger.
        self.fm.notify("Let's edit the file " + target_filename + "!")

        # Using bad=True in fm.notify allows you to print error messages:
        if not os.path.exists(target_filename):
            self.fm.notify("The given file does not exist!", bad=True)
            return

        # This executes a function from ranger.core.acitons, a module with a
        # variety of subroutines that can help you construct commands.
        # Check out the source, or run "pydoc ranger.core.actions" for a list.
        self.fm.edit_file(target_filename)

    # The tab method is called when you press tab, and should return a list of
    # suggestions that the user will tab through.
    # tabnum is 1 for <TAB> and -1 for <S-TAB> by default
    def tab(self, tabnum):
        # This is a generic tab-completion function that iterates through the
        # content of the current directory.
        return self._tab_directory_content()


class trash(Command):
    """:trash

    Move files to macOS Trash using /usr/bin/trash utility.
    Asks for confirmation when trashing multiple files or non-empty directories.
    """

    allow_abbrev = False
    escape_macros_for_shell = True

    def execute(self):
        import shlex

        def is_directory_with_files(path):
            return os.path.isdir(path) and not os.path.islink(path) and len(os.listdir(path)) > 0

        if self.rest(1):
            files = shlex.split(self.rest(1))
            many_files = (len(files) > 1 or (files and is_directory_with_files(files[0])))
        else:
            selection = self.fm.thistab.get_selection()
            if not selection:
                self.fm.notify("Error: no file selected for trashing!", bad=True)
                return

            files = [f.path for f in selection]
            many_files = (len(files) > 1 or (files and is_directory_with_files(files[0])))

        confirm = self.fm.settings.confirm_on_delete
        if confirm != 'never' and (confirm != 'multiple' or many_files):
            file_names = ', '.join([os.path.basename(f) for f in files])
            self.fm.ui.console.ask(
                "Trash %s (y/N)" % file_names,
                partial(self._do_trash, files),
                ('n', 'N', 'y', 'Y'),
            )
        else:
            self._do_trash(files, 'y')

    def tab(self, tabnum):
        return self._tab_directory_content()

    def _do_trash(self, files, answer):
        if answer != 'y' and answer != 'Y':
            return

        try:
            subprocess.run(['/usr/bin/trash'] + files, check=True)
            self.fm.notify("Trashed %d file(s)" % len(files))
            self.fm.thisdir.load_content()
        except subprocess.CalledProcessError as e:
            self.fm.notify("Error trashing files: %s" % str(e), bad=True)
        except FileNotFoundError:
            self.fm.notify("trash command not found at /usr/bin/trash", bad=True)
