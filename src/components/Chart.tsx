import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, DataZoomComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';
echarts.use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, CanvasRenderer]);
export function Chart({ option, onClick }: {
    option: EChartsOption;
    onClick?: (p: any) => void;
}) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const chart = echarts.init(ref.current!, ref.current!.closest('.light') ? undefined : 'dark');
        chart.setOption({ ...option, backgroundColor: 'transparent', textStyle: { fontFamily: 'system-ui' } });
        if (onClick)
            chart.on('click', onClick);
        const observer = new ResizeObserver(() => chart.resize());
        observer.observe(ref.current!);
        return () => { observer.disconnect(); chart.dispose(); };
    }, [option, onClick]);
    return <div ref={ref} className="chart"/>;
}
