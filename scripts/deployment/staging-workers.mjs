import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, readlink } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const application = '/home2/hastabaz/hastabazaar-staging-app';
// Linux x64 syscall ABI; pin the process before validating /proc, never kill a numeric PID.
const pidfdProgram = String.raw`
use strict;
use warnings;
use Config;
use Errno qw(ESRCH);
use JSON::PP qw(decode_json);
use POSIX ();
die "Unsupported pidfd architecture\n" unless $Config{archname} =~ /^x86_64-/;
sub pin {
  my ($pid) = @_;
  my $fd = syscall(434, $pid, 0);
  return $fd if $fd >= 0;
  return -1 if $! == ESRCH;
  die "pidfd_open unavailable: $!\n";
}
if ($ARGV[0] eq 'probe') {
  my $fd = pin($$);
  die "Own process pin failed\n" if $fd < 0;
  syscall(424, $fd, 0, 0, 0) == 0 or die "pidfd signal probe failed: $!\n";
  POSIX::close($fd);
  print "supported\n";
  exit 0;
}
my $worker = decode_json($ARGV[0]);
die "Invalid process identity\n" unless $worker->{pid} =~ /^[1-9][0-9]*$/ &&
  $worker->{uid} == $< && $worker->{effectiveUid} == $> && $worker->{startTime} =~ /^[0-9]+$/;
my $pid = 0 + $worker->{pid};
my $fd = pin($pid);
if ($fd < 0) { print "gone\n"; exit 0; }
sub text {
  my ($path) = @_;
  open my $in, '<', $path or return '';
  local $/;
  return <$in>;
}
my $status = text("/proc/$pid/status");
my ($real, $effective) = $status =~ /^Uid:\s+(\d+)\s+(\d+)/m;
my $stat = text("/proc/$pid/stat");
my ($tail) = $stat =~ /\)\s+(.*)$/;
my @fields = split /\s+/, ($tail // '');
my $cwd = readlink("/proc/$pid/cwd") // '';
my $command = text("/proc/$pid/comm");
if (!defined($real) || $real != $< || $effective != $> ||
    !defined($fields[19]) || $fields[19] ne $worker->{startTime} ||
    $cwd ne '/home2/hastabaz/hastabazaar-staging-app' || $command !~ /^lsnode:/) {
  POSIX::close($fd);
  print "changed\n";
  exit 0;
}
my $result = syscall(424, $fd, 15, 0, 0);
my $error = 0 + $!;
POSIX::close($fd);
if ($result < 0) {
  if ($error == ESRCH) { print "gone\n"; exit 0; }
  die "pidfd SIGTERM failed\n";
}
print "signaled\n";
`;

async function runPidfd(argument, signal) {
  assert.equal(process.platform, 'linux');
  assert.equal(process.arch, 'x64');
  const { stdout } = await execute('/usr/bin/perl', ['-e', pidfdProgram, '--', argument], { timeout: 5_000, signal });
  return stdout.trim();
}

export async function probeStagingPidfds(signal) {
  assert.equal(await runPidfd('probe', signal), 'supported');
}

async function stopWorkerWithPidfd(worker, signal) {
  const result = await runPidfd(JSON.stringify(worker), signal);
  assert.ok(['signaled', 'gone', 'changed'].includes(result));
  return result;
}

export function selectStagingWorkers(records, uid) {
  return records.filter((worker) => Number.isSafeInteger(worker.pid) && worker.pid > 0 &&
    worker.uid === uid && worker.effectiveUid === uid && worker.command.startsWith('lsnode:') &&
    worker.cwd === application && /^\d+$/.test(worker.startTime));
}

async function inspectWorker(pid) {
  try {
    const status = await readFile(`/proc/${pid}/status`, 'utf8');
    const users = status.match(/^Uid:\s+(\d+)\s+(\d+)/m);
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
    return { pid, uid: Number(users[1]), effectiveUid: Number(users[2]),
      cwd: await readlink(`/proc/${pid}/cwd`), command: (await readFile(`/proc/${pid}/comm`, 'utf8')).trim(),
      startTime: stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/)[19] };
  } catch { return null; }
}

export async function captureStagingWorkers(signal) {
  await probeStagingPidfds(signal);
  const { stdout } = await execute('/bin/ps', ['-u', String(process.getuid()), '-o', 'pid='], { timeout: 5_000, signal });
  const records = [];
  for (const text of stdout.trim().split(/\s+/)) {
    if (!/^\d+$/.test(text)) continue;
    const worker = await inspectWorker(Number(text));
    if (worker) records.push(worker);
  }
  return selectStagingWorkers(records, process.getuid());
}

export async function stopCapturedStagingWorkers(workers, signal, { uid = process.getuid(), stop = stopWorkerWithPidfd, inspect = inspectWorker } = {}) {
  for (const original of selectStagingWorkers(workers, uid)) {
    signal?.throwIfAborted();
    const result = await stop(original, signal);
    if (result === 'gone' || result === 'changed') continue;
    assert.equal(result, 'signaled');
    const deadline = Date.now() + 10_000;
    let stopped = false;
    while (Date.now() < deadline) {
      signal?.throwIfAborted();
      const current = await inspect(original.pid);
      if (!current || current.startTime !== original.startTime) { stopped = true; break; }
      await delay(100);
    }
    assert.ok(stopped, 'Identified staging worker did not stop; no stronger signal is issued.');
  }
}
