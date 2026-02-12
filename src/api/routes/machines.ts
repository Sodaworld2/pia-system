import { Router, Request, Response } from 'express';
import {
  getAllMachines,
  getMachineById,
  getMachineByHostname,
  createMachine,
  updateMachineStatus,
  updateMachineHeartbeat,
  deleteMachine,
  MachineInput,
} from '../../db/queries/machines.js';
import { getAgentsByMachine } from '../../db/queries/agents.js';
import { createLogger } from '../../utils/logger.js';

const router = Router();
const logger = createLogger('MachinesAPI');

// GET /api/machines - List all machines
router.get('/', (_req: Request, res: Response) => {
  try {
    const machines = getAllMachines();
    res.json(machines);
  } catch (error) {
    logger.error(`Failed to get machines: ${error}`);
    res.status(500).json({ error: 'Failed to get machines' });
  }
});

// GET /api/machines/:id - Get machine by ID
router.get('/:id', (req: Request, res: Response) => {
  try {
    const machine = getMachineById(req.params.id as string);
    if (!machine) {
      res.status(404).json({ error: 'Machine not found' });
      return;
    }

    // Include agents
    const agents = getAgentsByMachine(machine.id);

    res.json({ ...machine, agents });
  } catch (error) {
    logger.error(`Failed to get machine: ${error}`);
    res.status(500).json({ error: 'Failed to get machine' });
  }
});

// POST /api/machines - Register a new machine
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, hostname, ip_address, capabilities } = req.body as MachineInput & { ip_address?: string };

    if (!name || !hostname) {
      res.status(400).json({ error: 'Name and hostname are required' });
      return;
    }

    // Check if machine already exists
    const existing = getMachineByHostname(hostname);
    if (existing) {
      // Update existing machine
      updateMachineHeartbeat(existing.id, capabilities);
      const updated = getMachineById(existing.id);
      res.json(updated);
      return;
    }

    const machine = createMachine({ name, hostname, ip_address, capabilities });
    logger.info(`Machine registered: ${machine.name} (${machine.id})`);
    res.status(201).json(machine);
  } catch (error) {
    logger.error(`Failed to create machine: ${error}`);
    res.status(500).json({ error: 'Failed to create machine' });
  }
});

// POST /api/machines/:id/heartbeat - Update machine heartbeat
router.post('/:id/heartbeat', (req: Request, res: Response) => {
  try {
    const machine = getMachineById(req.params.id as string);
    if (!machine) {
      res.status(404).json({ error: 'Machine not found' });
      return;
    }

    const { capabilities, agents } = req.body;
    updateMachineHeartbeat(machine.id, capabilities);

    // If agents are provided, update them
    if (agents && Array.isArray(agents)) {
      const { updateAgentStatus } = require('../../db/queries/agents.js');
      for (const agent of agents) {
        if (agent.id && agent.status) {
          updateAgentStatus(agent.id, agent.status, {
            progress: agent.progress,
            last_output: agent.last_output,
          });
        }
      }
    }

    res.json({ status: 'ok' });
  } catch (error) {
    logger.error(`Failed to update heartbeat: ${error}`);
    res.status(500).json({ error: 'Failed to update heartbeat' });
  }
});

// PATCH /api/machines/:id - Update machine
router.patch('/:id', (req: Request, res: Response) => {
  try {
    const machine = getMachineById(req.params.id as string);
    if (!machine) {
      res.status(404).json({ error: 'Machine not found' });
      return;
    }

    const { status } = req.body;
    if (status) {
      updateMachineStatus(machine.id, status);
    }

    const updated = getMachineById(machine.id);
    res.json(updated);
  } catch (error) {
    logger.error(`Failed to update machine: ${error}`);
    res.status(500).json({ error: 'Failed to update machine' });
  }
});

// POST /api/machines/enroll - Enroll a new machine with full capabilities
router.post('/enroll', (req: Request, res: Response) => {
  try {
    const { name, hostname, ip_address, capabilities, ssh, resources } = req.body;

    if (!name || !hostname) {
      res.status(400).json({ error: 'name and hostname are required' });
      return;
    }

    // Check if machine already exists - update if so
    const existing = getMachineByHostname(hostname);
    if (existing) {
      const fullCapabilities = {
        ...(existing.capabilities || {}),
        ...capabilities,
        ssh: ssh || (existing.capabilities as Record<string, unknown>)?.ssh,
        resources: resources || (existing.capabilities as Record<string, unknown>)?.resources,
        enrolledAt: (existing.capabilities as Record<string, unknown>)?.enrolledAt,
        lastEnrollment: Math.floor(Date.now() / 1000),
      };
      updateMachineHeartbeat(existing.id, fullCapabilities);
      const updated = getMachineById(existing.id);
      logger.info(`Machine re-enrolled: ${hostname} (${existing.id})`);
      res.json({ status: 'updated', machine: updated });
      return;
    }

    // New enrollment
    const fullCapabilities = {
      ...capabilities,
      ssh: ssh || null,
      resources: resources || null,
      enrolledAt: Math.floor(Date.now() / 1000),
      lastEnrollment: Math.floor(Date.now() / 1000),
    };

    const machine = createMachine({
      name,
      hostname,
      ip_address,
      capabilities: fullCapabilities,
    });

    logger.info(`Machine enrolled: ${machine.name} @ ${hostname} (${machine.id})`);
    res.status(201).json({ status: 'enrolled', machine });
  } catch (error) {
    logger.error(`Failed to enroll machine: ${error}`);
    res.status(500).json({ error: 'Failed to enroll machine' });
  }
});

// GET /api/machines/:id/agents - List agents on a specific machine
router.get('/:id/agents', (req: Request, res: Response) => {
  try {
    const machine = getMachineById(req.params.id as string);
    if (!machine) {
      res.status(404).json({ error: 'Machine not found' });
      return;
    }

    const agents = getAgentsByMachine(machine.id);
    res.json({
      machine: { id: machine.id, name: machine.name, status: machine.status },
      agents,
      counts: {
        total: agents.length,
        working: agents.filter(a => a.status === 'working').length,
        idle: agents.filter(a => a.status === 'idle').length,
        error: agents.filter(a => a.status === 'error').length,
      },
    });
  } catch (error) {
    logger.error(`Failed to get machine agents: ${error}`);
    res.status(500).json({ error: 'Failed to get machine agents' });
  }
});

// POST /api/machines/:id/spawn - Spawn an agent on a specific machine
router.post('/:id/spawn', (req: Request, res: Response) => {
  try {
    const machine = getMachineById(req.params.id as string);
    if (!machine) {
      res.status(404).json({ error: 'Machine not found' });
      return;
    }

    const { template, task } = req.body;
    if (!template || !task) {
      res.status(400).json({ error: 'template and task are required' });
      return;
    }

    // Use the agent factory to spawn on this machine
    const { getAgentFactory } = require('../../agents/agent-factory.js');
    const factory = getAgentFactory();
    const result = factory.spawn(template, {
      machineId: machine.id,
      taskDescription: task,
    });

    logger.info(`Spawned ${result.agent.name} on ${machine.name}`);
    res.status(201).json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to spawn on machine: ${msg}`);
    res.status(400).json({ error: msg });
  }
});

// DELETE /api/machines/:id - Delete machine
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const machine = getMachineById(req.params.id as string);
    if (!machine) {
      res.status(404).json({ error: 'Machine not found' });
      return;
    }

    deleteMachine(machine.id);
    logger.info(`Machine deleted: ${machine.name} (${machine.id})`);
    res.json({ status: 'deleted' });
  } catch (error) {
    logger.error(`Failed to delete machine: ${error}`);
    res.status(500).json({ error: 'Failed to delete machine' });
  }
});

export default router;
