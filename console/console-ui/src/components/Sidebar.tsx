import { NavLink, Stack, Text, ScrollArea } from '@mantine/core';
import {
  IconLayoutDashboard, IconMessage, IconBox, IconKey,
  IconReceipt2, IconTerminal2, IconBoxMultiple,
  IconServer, IconCpu, IconRocket, IconChartArea, IconReportMoney,
  IconAlertTriangle, IconBuilding, IconWand, IconCloudDownload,
  IconShieldCheck, IconKey as IconKeyIcon, IconBrandOpenSource
} from '@tabler/icons-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isSaaS } from '@/utils/deployment';

const SHARED_SECTIONS = [
  { section: 'Home', items: [
    { label: 'Dashboard', icon: IconLayoutDashboard, path: '/dashboard' },
  ]},
  { section: 'Develop', items: [
    { label: 'Playground', icon: IconMessage, path: '/playground' },
    { label: 'Models', icon: IconBox, path: '/models' },
    { label: 'Model Registry', icon: IconCloudDownload, path: '/models/registry' },
  ]},
  { section: 'Inference', items: [
    { label: 'Endpoints', icon: IconTerminal2, path: '/endpoints' },
    { label: 'Batch Jobs', icon: IconBoxMultiple, path: '/batch-jobs' },
  ]},
  { section: 'Operations', items: [
    { label: 'Clusters', icon: IconServer, path: '/clusters' },
    { label: 'Nodes', icon: IconCpu, path: '/nodes' },
    { label: 'Deployments', icon: IconRocket, path: '/deployments' },
    { label: 'GPU Utilization', icon: IconChartArea, path: '/gpu-utilization' },
    { label: 'Cost Analytics', icon: IconReportMoney, path: '/cost-analytics' },
    { label: 'Incidents', icon: IconAlertTriangle, path: '/incidents' },
  ]},
];

const SAAS_SECTIONS = [
  { section: 'Develop SaaS', items: [
    { label: 'API Keys', icon: IconKey, path: '/api-keys' },
  ]},
  { section: 'Organization', items: [
    { label: 'Billing', icon: IconReceipt2, path: '/billing' },
    { label: 'Organization', icon: IconBuilding, path: '/settings/organization' },
  ]},
];

function getNavItems() {
  const sections = [...SHARED_SECTIONS];
  if (isSaaS()) {
    sections.push(...SAAS_SECTIONS);
  } else {
    sections.push(...getPrivateSections());
  }
  return sections;
}

function getPrivateSections() {
  return [
    { section: 'Setup', items: [
      { label: 'Setup Wizard', icon: IconWand, path: '/setup' },
    ]},
    { section: 'Management', items: [
      { label: 'Audit Logs', icon: IconReceipt2, path: '/audit-logs' },
      { label: 'Compliance', icon: IconShieldCheck, path: '/compliance' },
      { label: 'License', icon: IconKeyIcon, path: '/license' },
    ]},
    { section: 'Settings', items: [
      { label: 'SSO', icon: IconBrandOpenSource, path: '/settings/sso' },
      { label: 'Organization', icon: IconBuilding, path: '/settings/organization' },
    ]},
  ];
}

function isActive(itemPath: string, pathname: string): boolean {
  if (pathname === itemPath) return true;
  if (!pathname.startsWith(itemPath + '/')) return false;
  // /models should not match /models/registry (its own dedicated nav entry)
  if (itemPath === '/models' && pathname.startsWith('/models/registry')) return false;
  return true;
}

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = getNavItems();

  return (
    <ScrollArea
      h="100%"
      type="hover"
      scrollbarSize={8}
      offsetScrollbars
      styles={{ root: { height: '100%' } }}
    >
      <Stack gap="xs" p="md">
        {navItems.map((group) => (
          <Stack key={group.section} gap={2}>
            <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={4}>
              {group.section}
            </Text>
            {group.items.map((item) => (
              <NavLink
                key={item.path}
                label={item.label}
                leftSection={<item.icon size={18} style={{ color: 'var(--mantine-color-dimmed)' }} />}
                active={isActive(item.path, location.pathname)}
                onClick={() => navigate(item.path)}
                variant="light"
                style={{ borderRadius: 'var(--mantine-radius-md)' }}
              />
            ))}
          </Stack>
        ))}
      </Stack>
    </ScrollArea>
  );
}
