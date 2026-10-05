from pathlib import Path
from jarvisbr.config import Settings
from jarvisbr.policy import Risk,SecurityPolicy
def test_read_inside_allowed_dir_is_low_risk(tmp_path:Path):
 d=SecurityPolicy(Settings(allowed_dirs=[tmp_path])).decide("read_file",{"path":str(tmp_path/"a.txt")});assert d.allowed and d.risk==Risk.LOW
def test_write_inside_allowed_dir_requires_confirmation(tmp_path:Path):
 d=SecurityPolicy(Settings(allowed_dirs=[tmp_path])).decide("write_file",{"path":str(tmp_path/"a.txt")});assert d.allowed and d.risk==Risk.HIGH
def test_path_outside_allowed_dir_is_blocked(tmp_path:Path):
 a=tmp_path/"allowed";a.mkdir();d=SecurityPolicy(Settings(allowed_dirs=[a])).decide("read_file",{"path":str(tmp_path/"secret.txt")});assert not d.allowed and d.risk==Risk.BLOCKED
def test_shell_is_off_by_default():assert not SecurityPolicy(Settings(allow_shell=False)).decide("run_shell",{"command":["python","-V"]}).allowed
