import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_maps_cluster_manager/google_maps_cluster_manager.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../helpers/map_launcher_helper.dart';
import '../models/school_model.dart';

class SchoolMapTab extends StatefulWidget {
  final List<SchoolModel> schools;

  const SchoolMapTab({super.key, required this.schools});

  @override
  State<SchoolMapTab> createState() => _SchoolMapTabState();
}

class _SchoolMapTabState extends State<SchoolMapTab> with SingleTickerProviderStateMixin {
  GoogleMapController? _mapController;
  late ClusterManager<SchoolModel> _clusterManager;
  late TabController _tabController;
  final TextEditingController _searchController = TextEditingController();

  Set<Marker> _markers = {};
  Position? _userPosition;
  bool _isLoadingLocation = false;
  bool _nearestFirst = false;
  BitmapDescriptor? _schoolIcon;

  static const LatLng _defaultCenter = LatLng(-22.9068, -43.1729);

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _clusterManager = ClusterManager<SchoolModel>(
      widget.schools,
      _updateMarkers,
      markerBuilder: _markerBuilder,
      stopClusteringZoom: 16.5,
      levels: const [1, 4.25, 6.75, 8.25, 10.5, 12.5, 14.5, 16.5, 18],
    );
    _prepareMarkerIcon();
    _tryLoadUserLocation(silent: true);
  }

  @override
  void dispose() {
    _mapController?.dispose();
    _tabController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  List<SchoolModel> get _filteredSchools {
    final query = _searchController.text.trim().toLowerCase();
    final list = widget.schools.where((school) {
      if (query.isEmpty) return true;
      return school.name.toLowerCase().contains(query) ||
          school.neighborhood.toLowerCase().contains(query) ||
          school.address.toLowerCase().contains(query);
    }).toList();

    if (_nearestFirst && _userPosition != null) {
      list.sort((a, b) => _distanceFromUser(a).compareTo(_distanceFromUser(b)));
    }
    return list;
  }

  CameraPosition get _initialCameraPosition {
    if (widget.schools.isNotEmpty) {
      return CameraPosition(target: widget.schools.first.latLng, zoom: 11);
    }
    return const CameraPosition(target: _defaultCenter, zoom: 11);
  }

  Future<void> _prepareMarkerIcon() async {
    final icon = await _createSchoolMarkerIcon();
    if (!mounted) return;
    setState(() => _schoolIcon = icon);
    _clusterManager.setItems(_filteredSchools);
  }

  void _updateMarkers(Set<Marker> markers) {
    if (mounted) setState(() => _markers = markers);
  }

  Future<Marker> _markerBuilder(Cluster<SchoolModel> cluster) async {
    if (cluster.isMultiple) {
      return Marker(
        markerId: MarkerId(cluster.getId()),
        position: cluster.location,
        icon: await _createClusterMarkerIcon(cluster.count),
        onTap: () => _zoomToCluster(cluster),
      );
    }

    final school = cluster.items.first;
    return Marker(
      markerId: MarkerId(school.id),
      position: school.latLng,
      icon: _schoolIcon ?? BitmapDescriptor.defaultMarker,
      infoWindow: InfoWindow(title: school.name, snippet: school.neighborhood),
      onTap: () => _showSchoolBottomSheet(school),
    );
  }

  Future<void> _zoomToCluster(Cluster<SchoolModel> cluster) async {
    await _mapController?.animateCamera(CameraUpdate.newLatLngZoom(cluster.location, 15.5));
  }

  Future<BitmapDescriptor> _createSchoolMarkerIcon() async {
    const size = 120.0;
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    final paint = Paint()..isAntiAlias = true;
    final center = Offset(size / 2, size / 2);
    paint.color = const Color(0xFF2563EB);
    canvas.drawCircle(center, 42, paint);
    paint.color = Colors.white;
    canvas.drawCircle(center, 27, paint);
    final iconPainter = TextPainter(
      text: const TextSpan(text: '🏫', style: TextStyle(fontSize: 34)),
      textDirection: TextDirection.ltr,
    )..layout();
    iconPainter.paint(canvas, Offset(center.dx - iconPainter.width / 2, center.dy - iconPainter.height / 2));
    final image = await recorder.endRecording().toImage(size.toInt(), size.toInt());
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    return BitmapDescriptor.bytes(bytes!.buffer.asUint8List());
  }

  Future<BitmapDescriptor> _createClusterMarkerIcon(int count) async {
    const size = 130.0;
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    final paint = Paint()..isAntiAlias = true;
    final center = Offset(size / 2, size / 2);
    paint.color = const Color(0xFF1E3A8A);
    canvas.drawCircle(center, 48, paint);
    paint.color = const Color(0xFFDBEAFE);
    canvas.drawCircle(center, 37, paint);
    final textPainter = TextPainter(
      text: TextSpan(
        text: count.toString(),
        style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w800, color: Color(0xFF1E3A8A)),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    textPainter.paint(canvas, Offset(center.dx - textPainter.width / 2, center.dy - textPainter.height / 2));
    final image = await recorder.endRecording().toImage(size.toInt(), size.toInt());
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    return BitmapDescriptor.bytes(bytes!.buffer.asUint8List());
  }

  Future<void> _tryLoadUserLocation({bool silent = false}) async {
    if (_isLoadingLocation) return;
    setState(() => _isLoadingLocation = true);
    try {
      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        if (!silent) _showMessage('Ative o GPS para ver as unidades próximas.');
        return;
      }
      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        if (!silent) _showMessage('Permissão de localização negada.');
        return;
      }
      if (permission == LocationPermission.deniedForever) {
        if (!silent) _showLocationSettingsDialog();
        return;
      }
      final position = await Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.high);
      if (!mounted) return;
      setState(() => _userPosition = position);
      if (!silent) await _centerOnUser();
    } catch (_) {
      if (!silent) _showMessage('Não foi possível obter sua localização.');
    } finally {
      if (mounted) setState(() => _isLoadingLocation = false);
    }
  }

  Future<void> _centerOnUser() async {
    if (_userPosition == null) {
      await _tryLoadUserLocation();
      return;
    }
    await _mapController?.animateCamera(
      CameraUpdate.newLatLngZoom(LatLng(_userPosition!.latitude, _userPosition!.longitude), 15),
    );
  }

  double _distanceFromUser(SchoolModel school) {
    if (_userPosition == null) return double.infinity;
    return Geolocator.distanceBetween(_userPosition!.latitude, _userPosition!.longitude, school.latitude, school.longitude);
  }

  String _formatDistance(SchoolModel school) {
    final distance = _distanceFromUser(school);
    if (distance == double.infinity) return 'Distância indisponível';
    if (distance < 1000) return '${distance.round()} m de você';
    return '${(distance / 1000).toStringAsFixed(1)} km de você';
  }

  void _showSchoolBottomSheet(SchoolModel school) {
    showModalBottomSheet(
      context: context,
      showDragHandle: true,
      useSafeArea: true,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
      builder: (context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _SchoolInfoHeader(school: school, distanceText: _formatDistance(school)),
            const SizedBox(height: 18),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: () {
                  Navigator.pop(context);
                  MapLauncherHelper.openWaze(destination: school.latLng);
                },
                icon: const Icon(Icons.navigation_rounded),
                label: const Text('Abrir no Waze'),
              ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () {
                  Navigator.pop(context);
                  MapLauncherHelper.openGoogleMaps(destination: school.latLng);
                },
                icon: const Icon(Icons.map_rounded),
                label: const Text('Abrir no Google Maps'),
              ),
            ),
            const SizedBox(height: 14),
            _InfoTile(icon: Icons.location_on_outlined, title: 'Endereço', subtitle: school.fullAddress),
            if ((school.phone ?? '').trim().isNotEmpty) _InfoTile(icon: Icons.call_outlined, title: 'Telefone', subtitle: school.phone!),
            if ((school.directorName ?? '').trim().isNotEmpty) _InfoTile(icon: Icons.person_outline_rounded, title: 'Direção', subtitle: school.directorName!),
          ],
        ),
      ),
    );
  }

  void _showMessage(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message), behavior: SnackBarBehavior.floating));
  }

  Future<void> _showLocationSettingsDialog() async {
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Permissão de localização bloqueada'),
        content: const Text('Abra as configurações do aparelho e permita o acesso à localização.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Agora não')),
          FilledButton(
            onPressed: () {
              Navigator.pop(context);
              Geolocator.openAppSettings();
            },
            child: const Text('Abrir configurações'),
          ),
        ],
      ),
    );
  }

  void _onSearchChanged(String value) {
    setState(() {});
    _clusterManager.setItems(_filteredSchools);
    _clusterManager.updateMap();
  }

  Future<void> _focusOnSchool(SchoolModel school) async {
    _tabController.animateTo(0);
    await Future.delayed(const Duration(milliseconds: 250));
    await _mapController?.animateCamera(CameraUpdate.newLatLngZoom(school.latLng, 16));
    _showSchoolBottomSheet(school);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Mapa das Unidades'),
        actions: [
          IconButton(
            tooltip: 'Minha localização',
            onPressed: _isLoadingLocation ? null : _centerOnUser,
            icon: _isLoadingLocation
                ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.my_location_rounded),
          ),
        ],
        bottom: TabBar(controller: _tabController, tabs: const [Tab(icon: Icon(Icons.map_outlined), text: 'Mapa'), Tab(icon: Icon(Icons.list_alt_rounded), text: 'Lista')]),
      ),
      body: Column(
        children: [
          _SearchAndFilterBar(
            controller: _searchController,
            nearestFirst: _nearestFirst,
            onChanged: _onSearchChanged,
            onNearestChanged: (value) async {
              if (value && _userPosition == null) await _tryLoadUserLocation();
              setState(() => _nearestFirst = value);
              _clusterManager.setItems(_filteredSchools);
              _clusterManager.updateMap();
            },
          ),
          Expanded(child: TabBarView(controller: _tabController, children: [_buildMap(), _buildList()])),
        ],
      ),
    );
  }

  Widget _buildMap() {
    return Stack(
      children: [
        GoogleMap(
          initialCameraPosition: _initialCameraPosition,
          markers: _markers,
          myLocationEnabled: _userPosition != null,
          myLocationButtonEnabled: false,
          mapToolbarEnabled: false,
          zoomControlsEnabled: false,
          compassEnabled: true,
          onMapCreated: (controller) {
            _mapController = controller;
            _clusterManager.setMapId(controller.mapId);
          },
          onCameraMove: _clusterManager.onCameraMove,
          onCameraIdle: _clusterManager.updateMap,
        ),
        Positioned(left: 16, right: 16, bottom: 20, child: _MapSummaryCard(total: _filteredSchools.length, userLocated: _userPosition != null, onCenterUser: _centerOnUser)),
      ],
    );
  }

  Widget _buildList() {
    final schools = _filteredSchools;
    if (schools.isEmpty) return const Center(child: Padding(padding: EdgeInsets.all(24), child: Text('Nenhuma unidade encontrada.\nTente buscar por outro nome ou bairro.', textAlign: TextAlign.center)));
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      itemCount: schools.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (context, index) {
        final school = schools[index];
        return _SchoolListCard(
          school: school,
          distanceText: _formatDistance(school),
          onTap: () => _focusOnSchool(school),
          onWaze: () => MapLauncherHelper.openWaze(destination: school.latLng),
          onGoogleMaps: () => MapLauncherHelper.openGoogleMaps(destination: school.latLng),
        );
      },
    );
  }
}

class _SearchAndFilterBar extends StatelessWidget {
  final TextEditingController controller;
  final bool nearestFirst;
  final ValueChanged<String> onChanged;
  final ValueChanged<bool> onNearestChanged;

  const _SearchAndFilterBar({required this.controller, required this.nearestFirst, required this.onChanged, required this.onNearestChanged});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Theme.of(context).colorScheme.surface,
      elevation: 1,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
        child: Column(
          children: [
            SearchBar(controller: controller, hintText: 'Buscar escola ou bairro', leading: const Icon(Icons.search_rounded), onChanged: onChanged),
            const SizedBox(height: 10),
            Row(children: [
              FilterChip(selected: nearestFirst, avatar: const Icon(Icons.near_me_rounded, size: 18), label: const Text('Mais próximas primeiro'), onSelected: onNearestChanged),
              const SizedBox(width: 8),
              const Expanded(child: Chip(avatar: Icon(Icons.touch_app_rounded, size: 18), label: Text('Toque no pin para rotas'))),
            ]),
          ],
        ),
      ),
    );
  }
}

class _MapSummaryCard extends StatelessWidget {
  final int total;
  final bool userLocated;
  final VoidCallback onCenterUser;
  const _MapSummaryCard({required this.total, required this.userLocated, required this.onCenterUser});

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 8,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(children: [
          CircleAvatar(backgroundColor: Theme.of(context).colorScheme.primaryContainer, child: Icon(Icons.school_rounded, color: Theme.of(context).colorScheme.onPrimaryContainer)),
          const SizedBox(width: 12),
          Expanded(child: Text('$total unidade(s) no mapa', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800))),
          IconButton.filledTonal(tooltip: userLocated ? 'Centralizar em mim' : 'Ativar localização', onPressed: onCenterUser, icon: const Icon(Icons.my_location_rounded)),
        ]),
      ),
    );
  }
}

class _SchoolInfoHeader extends StatelessWidget {
  final SchoolModel school;
  final String distanceText;
  const _SchoolInfoHeader({required this.school, required this.distanceText});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      CircleAvatar(radius: 27, backgroundColor: theme.colorScheme.primaryContainer, child: Icon(Icons.school_rounded, color: theme.colorScheme.onPrimaryContainer)),
      const SizedBox(width: 14),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(school.name, style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
        const SizedBox(height: 4),
        Text(school.fullAddress, style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
        const SizedBox(height: 8),
        Chip(avatar: const Icon(Icons.near_me_rounded, size: 18), label: Text(distanceText)),
      ])),
    ]);
  }
}

class _InfoTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  const _InfoTile({required this.icon, required this.title, required this.subtitle});

  @override
  Widget build(BuildContext context) => ListTile(dense: true, contentPadding: EdgeInsets.zero, leading: Icon(icon), title: Text(title), subtitle: Text(subtitle));
}

class _SchoolListCard extends StatelessWidget {
  final SchoolModel school;
  final String distanceText;
  final VoidCallback onTap;
  final VoidCallback onWaze;
  final VoidCallback onGoogleMaps;
  const _SchoolListCard({required this.school, required this.distanceText, required this.onTap, required this.onWaze, required this.onGoogleMaps});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      elevation: 1,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 12, 12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(school.name, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
            const SizedBox(height: 6),
            Text(school.fullAddress, style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
            const SizedBox(height: 10),
            Row(children: [
              Chip(avatar: const Icon(Icons.near_me_rounded, size: 17), label: Text(distanceText)),
              const Spacer(),
              IconButton.filled(tooltip: 'Abrir no Waze', onPressed: onWaze, icon: const Icon(Icons.navigation_rounded)),
              const SizedBox(width: 8),
              IconButton.filledTonal(tooltip: 'Abrir no Google Maps', onPressed: onGoogleMaps, icon: const Icon(Icons.map_rounded)),
            ]),
          ]),
        ),
      ),
    );
  }
}
